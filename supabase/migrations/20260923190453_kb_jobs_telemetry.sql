-- §5.3 Knowledge base, catalogue, jobs, telemetry
create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('faq','policy','product','care','approved_answer')),
  language text not null default 'en' check (language in ('bn','en','mixed')),
  content text not null,
  is_active boolean not null default true,
  version int not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  document_id uuid not null references kb_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(768) not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index kb_chunks_org_idx on kb_chunks (org_id);
create index kb_chunks_hnsw on kb_chunks using hnsw (embedding extensions.vector_cosine_ops);

create or replace function match_kb_chunks(p_org_id uuid, p_query extensions.vector(768), p_match_count int default 5)
returns table (chunk_id uuid, document_id uuid, title text, kind text, content text, similarity float)
language sql stable set search_path = public, extensions as $$
  select c.id, c.document_id, d.title, d.kind, c.content,
         1 - (c.embedding <=> p_query) as similarity
  from kb_chunks c
  join kb_documents d on d.id = c.document_id
  where c.org_id = p_org_id and d.is_active
  order by c.embedding <=> p_query
  limit p_match_count;
$$;
revoke execute on function match_kb_chunks(uuid, extensions.vector, int) from public, anon, authenticated;

create table products_cache (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  external_id text not null,
  name text not null,
  price_minor int,                 -- poisha / minor units; integer only
  currency text not null default 'BDT',
  in_stock boolean,
  attributes jsonb not null default '{}'::jsonb,
  url text,
  synced_at timestamptz not null default now(),
  unique (org_id, external_id)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,
  type text not null,              -- 'process_ticket' | 'embed_document' | 'sync_catalog' | 'remind_reviewers'
  payload jsonb not null default '{}'::jsonb,
  status job_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_claim_idx on jobs (status, run_after);

create or replace function claim_jobs(p_limit int, p_lease_seconds int)
returns setof jobs language sql set search_path = public as $$
  update jobs
     set status = 'running',
         locked_until = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1,
         updated_at = now()
   where id in (
     select id from jobs
      where (status = 'queued' and run_after <= now())
         or (status = 'running' and locked_until < now())
      order by run_after
      limit p_limit
      for update skip locked)
  returning *;
$$;
revoke execute on function claim_jobs(int, int) from public, anon, authenticated;

create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,
  ticket_id uuid references tickets(id) on delete set null,
  step text not null,              -- classify | draft | groundedness | embed
  provider text not null,
  model text not null,
  prompt_version text,
  ok boolean not null,
  error text,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

create table provider_usage (
  provider text not null,
  model text not null,
  day date not null,
  requests int not null default 0,
  cooldown_until timestamptz,
  primary key (provider, model, day)
);

create or replace function increment_provider_usage(p_provider text, p_model text)
returns int language sql set search_path = public as $$
  insert into provider_usage (provider, model, day, requests)
  values (p_provider, p_model, current_date, 1)
  on conflict (provider, model, day) do update set requests = provider_usage.requests + 1
  returning requests;
$$;
revoke execute on function increment_provider_usage(text, text) from public, anon, authenticated;

create table ticket_events (          -- append-only audit log
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  actor text not null,               -- 'system' | 'ai' | 'bridge' | 'telegram:<chatId>' | 'user:<uuid>'
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- Returns true while the caller is still within p_max hits for the current fixed window.
create or replace function hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean language sql set search_path = public as $$
  insert into rate_limit_hits (key, window_start, count)
  values (p_key, to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds), 1)
  on conflict (key, window_start) do update set count = rate_limit_hits.count + 1
  returning count <= p_max;
$$;
revoke execute on function hit_rate_limit(text, int, int) from public, anon, authenticated;
