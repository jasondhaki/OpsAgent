import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

// Runs against the local Supabase DB (`supabase start` or `supabase db start`).
const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const client = new Client({ connectionString: url });

beforeAll(() => client.connect());
afterAll(() => client.end());

describe('database security', () => {
  it('RLS is enabled on every public table', async () => {
    const { rows } = await client.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('demo org can never enqueue outbound email', async () => {
    await client.query('begin');
    try {
      const { rows: [t] } = await client.query(
        `insert into tickets (org_id, channel) select id, 'simulator' from orgs where slug = 'demo' returning id, org_id`,
      );
      const { rows: [d] } = await client.query(
        `insert into drafts (org_id, ticket_id, version, body, author) values ($1, $2, 1, 'x', 'ai') returning id`,
        [t.org_id, t.id],
      );
      await expect(
        client.query(
          `insert into outbox (org_id, ticket_id, draft_id, to_address, body) values ($1, $2, $3, 'a@example.com', 'x')`,
          [t.org_id, t.id, d.id],
        ),
      ).rejects.toThrow(/demo org cannot enqueue/);
    } finally {
      await client.query('rollback');
    }
  });

  it('ticket_events is append-only', async () => {
    await client.query('begin');
    try {
      const { rows: [t] } = await client.query(
        `insert into tickets (org_id, channel) select id, 'simulator' from orgs where slug = 'demo' returning id, org_id`,
      );
      await client.query(
        `insert into ticket_events (org_id, ticket_id, actor, type) values ($1, $2, 'system', 'ingested')`,
        [t.org_id, t.id],
      );
      await expect(client.query(`delete from ticket_events where ticket_id = $1`, [t.id])).rejects.toThrow(/append-only/);
    } finally {
      await client.query('rollback');
    }
  });

  it('service-only functions are not callable by anon/authenticated', async () => {
    const { rows } = await client.query(
      `select p.proname, r.rolname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         cross join (values ('anon'), ('authenticated')) r(rolname)
        where n.nspname = 'public'
          and p.proname in ('match_kb_chunks','claim_jobs','increment_provider_usage','hit_rate_limit')
          and has_function_privilege(r.rolname, p.oid, 'execute')`,
    );
    expect(rows).toEqual([]);
  });
});
