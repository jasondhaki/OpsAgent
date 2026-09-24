import { beforeAll, describe, expect, it } from 'vitest';
import { localDb } from './client';
import { fakeEmbedder, fakeLlm } from '@/server/ai/fake';
import { mockOrders } from '@/server/adapters/orders/mock';
import { ingestEmail } from '@/server/bridge/ingest';
import { ackOutbox, claimOutbox, reapStaleClaims } from '@/server/bridge/outbox';
import { tick } from '@/server/bridge/tick';
import type { IngestPayload } from '@/lib/contracts';

const db = localDb();
let org: string;

const payload = (o: Partial<IngestPayload> = {}): IngestPayload => ({
  gmailMessageId: `gm-${Math.random()}`,
  gmailThreadId: `th-${Math.random()}`,
  rfcMessageId: `<${Math.random()}@mail.example.com>`,
  from: 'Rina <rina@example.com>',
  to: 'shop@example.com',
  subject: 'Delivery?',
  date: new Date().toISOString(),
  plainBody: 'How much is delivery outside Dhaka?',
  headers: {},
  ...o,
});

beforeAll(async () => {
  const { data, error } = await db.from('orgs').insert({ slug: `test-bridge-${Date.now()}`, name: 'Bridge test', settings: { signature: '— T' } }).select('id').single();
  if (error) throw error;
  org = data.id;
});

const jobsFor = async (ticketId: string) =>
  (await db.from('jobs').select('type, status').contains('payload', { ticketId })).data ?? [];

describe('ingest', () => {
  it('stores the message, enqueues process_ticket, and dedupes a re-post', async () => {
    const p = payload();
    const first = await ingestEmail(db, org, p);
    expect(first.status).toBe('queued');
    // Status may already be running/done: the tick test in a parallel file claims jobs from any org.
    expect((await jobsFor(first.ticketId!)).map((j) => j.type)).toEqual(['process_ticket']);
    const again = await ingestEmail(db, org, p);
    expect(again).toEqual({ status: 'duplicate', ticketId: first.ticketId });
    expect((await db.from('messages').select('id').eq('ticket_id', first.ticketId!)).data).toHaveLength(1);
  });

  it('a follow-up in the same Gmail thread lands on the same ticket', async () => {
    const thread = `th-${Math.random()}`;
    const a = await ingestEmail(db, org, payload({ gmailThreadId: thread }));
    const b = await ingestEmail(db, org, payload({ gmailThreadId: thread, plainBody: 'Also, COD?' }));
    expect(b.ticketId).toBe(a.ticketId);
  });

  it('an out-of-office reply is closed without a job and does not touch the live thread ticket', async () => {
    const thread = `th-${Math.random()}`;
    const live = await ingestEmail(db, org, payload({ gmailThreadId: thread }));
    const ooo = await ingestEmail(db, org, payload({ gmailThreadId: thread, headers: { 'Auto-Submitted': 'auto-replied' } }));
    expect(ooo.status).toBe('filtered');
    expect(ooo.ticketId).not.toBe(live.ticketId);
    expect((await db.from('tickets').select('status').eq('id', ooo.ticketId!).single()).data?.status).toBe('closed');
    expect((await db.from('tickets').select('status').eq('id', live.ticketId!).single()).data?.status).toBe('received');
    expect(await jobsFor(ooo.ticketId!)).toEqual([]);
  });

  it('blocked customers are stored but never processed', async () => {
    await db.from('customers').upsert({ org_id: org, email: 'blocked@example.com', is_blocked: true }, { onConflict: 'org_id,email' });
    const r = await ingestEmail(db, org, payload({ from: 'blocked@example.com' }));
    expect(r.status).toBe('blocked');
    expect(await jobsFor(r.ticketId!)).toEqual([]);
  });
});

async function queuedOutbox(status: 'queued' | 'cancelled' = 'queued') {
  const { data: t } = await db.from('tickets').insert({ org_id: org, channel: 'email', status: 'approved' }).select('id').single();
  const { data: d } = await db.from('drafts').insert({ org_id: org, ticket_id: t!.id, version: 1, body: 'Reply body', author: 'ai' }).select('id').single();
  const { data: o, error } = await db
    .from('outbox')
    .insert({ org_id: org, ticket_id: t!.id, draft_id: d!.id, to_address: 'rina@example.com', body: 'Reply body', reply_to_provider_message_id: 'gm-1', status })
    .select('id')
    .single();
  if (error) throw error;
  return { outboxId: o.id, ticketId: t!.id };
}

const drain = async () => {
  // Earlier tests' rows must not leak into claim assertions.
  await db.from('outbox').update({ status: 'cancelled' }).eq('org_id', org).in('status', ['queued', 'claimed']);
};

describe('outbox claim / ack', () => {
  it('claims queued items only (cancelled simulator rows are never handed to the bridge)', async () => {
    await drain();
    const q = await queuedOutbox();
    await queuedOutbox('cancelled');
    const items = await claimOutbox(db, org, 10, 80);
    expect(items.map((i) => i.id)).toEqual([q.outboxId]);
    expect(items[0]).toMatchObject({ to: 'rina@example.com', replyToProviderMessageId: 'gm-1' });
    expect(await claimOutbox(db, org, 10, 80)).toEqual([]); // leased
  });

  it('ack marks sent, records the outbound message once, and a re-ack is a no-op', async () => {
    await drain();
    const q = await queuedOutbox();
    await claimOutbox(db, org, 10, 80);
    expect(await ackOutbox(db, org, [{ id: q.outboxId, ok: true, sentRef: 'gm-sent-1' }])).toEqual([{ id: q.outboxId, result: 'sent' }]);
    expect(await ackOutbox(db, org, [{ id: q.outboxId, ok: true, sentRef: 'gm-sent-1' }])).toEqual([{ id: q.outboxId, result: 'already_sent' }]);
    expect((await db.from('tickets').select('status').eq('id', q.ticketId).single()).data?.status).toBe('sent');
    expect((await db.from('messages').select('direction').eq('ticket_id', q.ticketId)).data).toEqual([{ direction: 'outbound' }]);
  });

  it('crash between send and ack: the expired lease is re-claimed and the late ack still counts once', async () => {
    await drain();
    const q = await queuedOutbox();
    await claimOutbox(db, org, 10, 80);
    await db.from('outbox').update({ claimed_until: new Date(Date.now() - 1000).toISOString() }).eq('id', q.outboxId);
    const again = await claimOutbox(db, org, 10, 80);
    expect(again.map((i) => i.id)).toEqual([q.outboxId]); // bridge sees sent_<id> and only re-acks
    expect((await ackOutbox(db, org, [{ id: q.outboxId, ok: true }]))[0].result).toBe('sent');
    expect((await db.from('messages').select('id').eq('ticket_id', q.ticketId).eq('direction', 'outbound')).data).toHaveLength(1);
  });

  it('failures retry until the 3rd attempt, then surface the ticket as error', async () => {
    await drain();
    const q = await queuedOutbox();
    for (const expected of ['retry', 'retry', 'failed']) {
      const [item] = await claimOutbox(db, org, 10, 80);
      expect(item.id).toBe(q.outboxId);
      expect((await ackOutbox(db, org, [{ id: q.outboxId, ok: false, error: 'quota' }]))[0].result).toBe(expected);
    }
    expect((await db.from('tickets').select('status').eq('id', q.ticketId).single()).data?.status).toBe('error');
    expect(await claimOutbox(db, org, 10, 80)).toEqual([]);
  });

  it('never exceeds the rolling daily cap', async () => {
    await drain();
    await queuedOutbox();
    await queuedOutbox();
    const { count: sentToday } = await db.from('outbox').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('status', 'sent').gte('sent_at', new Date(Date.now() - 86_400_000).toISOString());
    expect(await claimOutbox(db, org, 10, sentToday ?? 0)).toEqual([]);
    expect(await claimOutbox(db, org, 10, (sentToday ?? 0) + 1)).toHaveLength(1);
  });

  it('reaps leases that expired after the last attempt', async () => {
    await drain();
    const q = await queuedOutbox();
    await db.from('outbox').update({ status: 'claimed', attempts: 3, claimed_until: new Date(Date.now() - 1000).toISOString() }).eq('id', q.outboxId);
    expect(await reapStaleClaims(db)).toBeGreaterThanOrEqual(1);
    expect((await db.from('outbox').select('status').eq('id', q.outboxId).single()).data?.status).toBe('failed');
  });
});

describe('tick', () => {
  it('records a heartbeat and runs queued process_ticket jobs (reviewers notified on needs_review)', async () => {
    const r = await ingestEmail(db, org, payload({ plainBody: 'The strap is torn, I want a refund.' }));
    const notified: string[] = [];
    const llm = fakeLlm((call) => {
      if (call.step === 'classify')
        return { intent: 'complaint_return', urgency: 'medium', sentiment: 'negative', language: 'en', orderRef: null, productMentions: [], lead: null, riskFlags: ['refund_request'], reasoning: 't' };
      if (call.step === 'draft') return { reply: 'Sorry!\n— T', citedChunkIds: [], language: 'en', needsHumanBecause: null };
      return { verdict: 'supported', unsupportedClaims: [] };
    });
    // Other tests' queued jobs may run too; give them enough budget.
    await tick({ db, llm, embedder: fakeEmbedder(), orders: mockOrders, notify: async (id) => void notified.push(id) }, org, 'bridge', 20_000);
    expect((await db.from('tickets').select('status').eq('id', r.ticketId!).single()).data?.status).toBe('needs_review');
    expect(notified).toContain(r.ticketId);
    const { data: hb } = await db.from('bridge_heartbeats').select('source').eq('org_id', org).single();
    expect(hb?.source).toBe('bridge');
  });
});
