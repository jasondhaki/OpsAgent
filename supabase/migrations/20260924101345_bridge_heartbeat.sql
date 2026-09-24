-- Last time each org's Gmail bridge / backup cron called /api/bridge/tick (shown in Settings).
-- Its own table so the 5-minute heartbeat never races with a settings save on orgs.settings.
create table bridge_heartbeats (
  org_id uuid primary key references orgs(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  source text not null check (source in ('bridge', 'cron'))
);
alter table bridge_heartbeats enable row level security;
create policy member_read on bridge_heartbeats for select to authenticated using (is_org_member(org_id));
