-- Last successful live run per demo sample, replayed when the free AI quota or demo limits are
-- exhausted so the public demo never breaks. Service role only: RLS on, no policies.
create table demo_traces (
  sample_key text primary key,
  ticket_id uuid references tickets(id) on delete set null,
  result jsonb not null,
  updated_at timestamptz not null default now()
);
alter table demo_traces enable row level security;
