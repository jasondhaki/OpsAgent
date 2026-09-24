-- Atomically lease outbound emails to the Gmail bridge (CLAUDE.md §8.2).
-- Expired leases are re-claimable until 3 attempts; after that the tick marks them failed.
-- Only 'queued' rows are ever claimed: 'cancelled' (simulator) rows can never be sent.
create or replace function claim_outbox(p_org_id uuid, p_limit int, p_lease_seconds int)
returns setof outbox language sql set search_path = public as $$
  update outbox
     set status = 'claimed',
         claimed_until = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1
   where id in (
     select id from outbox
      where org_id = p_org_id
        and (status = 'queued' or (status = 'claimed' and claimed_until < now() and attempts < 3))
      order by created_at
      limit greatest(p_limit, 0)
      for update skip locked)
  returning *;
$$;
revoke execute on function claim_outbox(uuid, int, int) from public, anon, authenticated;
