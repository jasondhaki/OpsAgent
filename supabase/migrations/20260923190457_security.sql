-- §5.4 Security in the database
alter table orgs            enable row level security;
alter table org_members     enable row level security;
alter table customers       enable row level security;
alter table tickets         enable row level security;
alter table messages        enable row level security;
alter table drafts          enable row level security;
alter table outbox          enable row level security;
alter table kb_documents    enable row level security;
alter table kb_chunks       enable row level security;
alter table products_cache  enable row level security;
alter table jobs            enable row level security;
alter table ai_runs         enable row level security;
alter table provider_usage  enable row level security;
alter table ticket_events   enable row level security;
alter table rate_limit_hits enable row level security;

create or replace function is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members where org_id = p_org and user_id = auth.uid());
$$;
revoke execute on function is_org_member(uuid) from public, anon;
grant execute on function is_org_member(uuid) to authenticated;

-- Read policies for the dashboard (authenticated members, own org only).
-- NO policies on jobs, provider_usage, rate_limit_hits; no write policies anywhere (service role only).
create policy member_read on orgs           for select to authenticated using (is_org_member(id));
create policy member_read on customers      for select to authenticated using (is_org_member(org_id));
create policy member_read on tickets        for select to authenticated using (is_org_member(org_id));
create policy member_read on messages       for select to authenticated using (is_org_member(org_id));
create policy member_read on drafts         for select to authenticated using (is_org_member(org_id));
create policy member_read on outbox         for select to authenticated using (is_org_member(org_id));
create policy member_read on kb_documents   for select to authenticated using (is_org_member(org_id));
create policy member_read on kb_chunks      for select to authenticated using (is_org_member(org_id));
create policy member_read on products_cache for select to authenticated using (is_org_member(org_id));
create policy member_read on ai_runs        for select to authenticated using (is_org_member(org_id));
create policy member_read on ticket_events  for select to authenticated using (is_org_member(org_id));
-- A member may see their own memberships (needed by requireMember via the user client).
create policy own_membership_read on org_members for select to authenticated using (user_id = auth.uid());

-- Audit log is append-only even for service role mistakes
create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin raise exception 'ticket_events is append-only'; end; $$;
create trigger ticket_events_immutable before update or delete on ticket_events
  for each row execute function forbid_mutation();

-- Demo org can never send
create or replace function forbid_demo_outbox() returns trigger language plpgsql
set search_path = public as $$
begin
  if exists (select 1 from orgs where id = new.org_id and is_demo) then
    raise exception 'demo org cannot enqueue outbound email';
  end if;
  return new;
end; $$;
create trigger outbox_no_demo before insert or update on outbox
  for each row execute function forbid_demo_outbox();
