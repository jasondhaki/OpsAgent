import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDb } from './client';
import { fakeEmbedder, fakeLlm } from '@/server/ai/fake';
import { mockOrders } from '@/server/adapters/orders/mock';
import { DEMO_PER_IP_PER_DAY, runDemo } from '@/server/demo';
import { PURGED, purgeOldBodies } from '@/server/jobs/retention';
import type { PipelineDeps } from '@/server/pipeline/orchestrator';
import { SAMPLES } from '@/lib/samples';

const db = localDb();
const okLlm = fakeLlm((call) => {
  if (call.step === 'classify')
    return { intent: 'complaint_return', urgency: 'medium', sentiment: 'negative', language: 'en', orderRef: null, productMentions: [], lead: null, riskFlags: [], reasoning: 't' };
  if (call.step === 'draft') return { reply: 'Sorry!\n— Demo Crafts', citedChunkIds: [], language: 'en', needsHumanBecause: null };
  return { verdict: 'supported', unsupportedClaims: [] };
});
const deadLlm = fakeLlm(() => { throw new Error('quota'); });
const deps = (llm = okLlm): PipelineDeps => ({ db, llm, embedder: fakeEmbedder(), orders: mockOrders });
const angry = SAMPLES.find((s) => s.key === 'angry')!;

describe('public demo', () => {
  // These tests write the shared 'angry' replay; put the real recording back afterwards.
  let saved: { sample_key: string; ticket_id: string | null; result: unknown; updated_at: string } | null = null;
  beforeAll(async () => {
    saved = (await db.from('demo_traces').select('*').eq('sample_key', 'angry').maybeSingle()).data;
  });
  afterAll(async () => {
    if (saved) await db.from('demo_traces').upsert(saved as never);
    else await db.from('demo_traces').delete().eq('sample_key', 'angry');
  });

  it('a live sample run is dry-run in the demo org and recorded for replay', async () => {
    const r = await runDemo(deps(), { visitorKey: `t-${Math.random()}`, subject: angry.subject, body: angry.body, sampleKey: 'angry' });
    expect(r.mode).toBe('live');
    if (r.mode !== 'live') return;
    const { data: t } = await db.from('tickets').select('channel, org:orgs(is_demo)').eq('id', r.ticketId).single();
    expect(t).toMatchObject({ channel: 'simulator', org: { is_demo: true } });
    expect((await db.from('outbox').select('id').eq('ticket_id', r.ticketId)).data).toEqual([]);
    const { data: rec } = await db.from('demo_traces').select('ticket_id').eq('sample_key', 'angry').single();
    expect(rec?.ticket_id).toBe(r.ticketId);
  });

  it('free text is never recorded as a sample replay', async () => {
    const before = (await db.from('demo_traces').select('ticket_id').eq('sample_key', 'angry').single()).data?.ticket_id;
    await runDemo(deps(), { visitorKey: `t-${Math.random()}`, subject: 'x', body: 'something else entirely', sampleKey: 'angry' });
    expect((await db.from('demo_traces').select('ticket_id').eq('sample_key', 'angry').single()).data?.ticket_id).toBe(before);
  });

  it('after the per-visitor limit, replays instead of calling the AI', async () => {
    const visitorKey = `t-${Math.random()}`;
    for (let i = 0; i < DEMO_PER_IP_PER_DAY; i++) await db.rpc('hit_rate_limit', { p_key: `demo:ip:${visitorKey}`, p_window_seconds: 86_400, p_max: 999 });
    const r = await runDemo(deps(deadLlm), { visitorKey, subject: angry.subject, body: angry.body, sampleKey: 'angry' });
    expect(r.mode).toBe('replay');
    if (r.mode === 'replay') expect(r.note).toMatch(/10 live runs/);
  });

  it('when the AI is unavailable, replays a recorded run so the demo never breaks', async () => {
    const r = await runDemo(deps(deadLlm), { visitorKey: `t-${Math.random()}`, subject: angry.subject, body: angry.body, sampleKey: 'angry' });
    expect(r.mode).toBe('replay');
    if (r.mode === 'replay') expect(r.note).toMatch(/quota/);
  });
});

describe('retention', () => {
  it('blanks bodies of finished tickets older than 180 days, keeps recent and open ones', async () => {
    const { data: org } = await db.from('orgs').insert({ slug: `test-ret-${Date.now()}`, name: 'Retention' }).select('id').single();
    const old = new Date(Date.now() - 181 * 86_400_000).toISOString();
    const mk = async (status: 'closed' | 'needs_review', lastAt: string) => {
      const { data: t } = await db.from('tickets').insert({ org_id: org!.id, channel: 'email', status, last_message_at: lastAt }).select('id').single();
      await db.from('messages').insert({ org_id: org!.id, ticket_id: t!.id, direction: 'inbound', body_text: 'call me 01712345678', body_redacted: 'call me [PHONE]' });
      return t!.id;
    };
    const oldClosed = await mk('closed', old);
    const oldOpen = await mk('needs_review', old);
    const recentClosed = await mk('closed', new Date().toISOString());
    // Other tests' data may also be old; drain until nothing is left.
    while ((await purgeOldBodies(db)) > 0);
    const body = async (id: string) => (await db.from('messages').select('body_text, body_redacted').eq('ticket_id', id).single()).data;
    expect(await body(oldClosed)).toEqual({ body_text: PURGED, body_redacted: null });
    expect((await body(oldOpen))?.body_text).toBe('call me 01712345678');
    expect((await body(recentClosed))?.body_text).toBe('call me 01712345678');
    // Metadata survives for /insights.
    expect((await db.from('tickets').select('status').eq('id', oldClosed).single()).data?.status).toBe('closed');
  });
});
