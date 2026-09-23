-- §5.2 Core tables
create table orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_demo boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'reviewer',
  primary key (org_id, user_id)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email extensions.citext not null,
  display_name text,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  channel channel not null,
  customer_id uuid references customers(id) on delete set null,
  external_thread_id text,                         -- Gmail thread id
  subject text,
  status ticket_status not null default 'received',
  intent ticket_intent,
  urgency urgency_level,
  sentiment sentiment_level,
  language text check (language in ('bn','en','mixed')),
  risk_flags text[] not null default '{}',
  requires_human boolean not null default true,    -- safe default
  classification jsonb,                            -- full Zod output
  lead jsonb,                                      -- for custom_bulk_order
  gate jsonb,                                      -- GateDecision
  pipeline_step text,                              -- last completed step, for resumable jobs
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, channel, external_thread_id)
);
create index tickets_queue_idx on tickets (org_id, status, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  direction msg_direction not null,
  external_message_id text,                        -- RFC 5322 Message-ID (dedupe key)
  provider_message_id text,                        -- Gmail message id (needed to reply in-thread)
  from_address extensions.citext,
  body_text text not null,                         -- normalised, max 8k chars
  body_redacted text,                              -- what the LLM sees
  headers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, external_message_id)
);

create table drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  version int not null,
  body text not null,
  language text,
  citations jsonb not null default '[]'::jsonb,    -- [{chunkId, title, similarity}]
  validator jsonb,
  groundedness jsonb,
  author text not null check (author in ('ai','human')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (ticket_id, version)
);

create table outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  draft_id uuid not null unique references drafts(id),
  to_address extensions.citext not null,
  reply_to_provider_message_id text,               -- null => new email
  subject text,
  body text not null,
  status outbox_status not null default 'queued',
  attempts int not null default 0,
  claimed_until timestamptz,
  sent_at timestamptz,
  sent_ref text,
  last_error text,
  created_at timestamptz not null default now()
);
create index outbox_claim_idx on outbox (status, created_at);
