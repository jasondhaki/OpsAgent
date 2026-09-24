import { beforeAll, describe, expect, it } from 'vitest';
import { localDb } from './client';
import { fakeEmbedder, fakeLlm } from '@/server/ai/fake';
import type { StructuredCall } from '@/server/ai/providers';
import { mockOrders } from '@/server/adapters/orders/mock';
import { createInbound } from '@/server/db/repos/tickets';
import { processTicket, type PipelineDeps } from '@/server/pipeline/orchestrator';
import { ALREADY_HANDLED, approveDraft, regenerateDraft, rejectTicket, saveApprovedAnswer } from '@/server/review';

const db = localDb();

const llm = fakeLlm((call: StructuredCall<unknown>) => {
  if (call.step === 'classify')
    return {
      intent: 'complaint_return', urgency: 'medium', sentiment: 'negative', language: 'en', orderRef: null,
      productMentions: [], lead: null, riskFlags: ['damaged_item'], reasoning: 'test',
    };
  if (call.step === 'draft') {
    const steered = call.prompt.includes('<reviewer_instruction>');
    return { reply: steered ? 'Steered reply.\n— Test Shop' : 'Sorry to hear that.\n— Test Shop', citedChunkIds: [], language: 'en', needsHumanBecause: null };
  }
  return { verdict: 'supported', unsupportedClaims: [] };
});
const deps: PipelineDeps = { db, llm, embedder: fakeEmbedder(), orders: mockOrders };

async function makeOrg(isDemo = false) {
  const { data, error } = await db
    .from('orgs')
    .insert({ slug: `test-review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: 'Review test', is_demo: isDemo, settings: { signature: '— Test Shop' } })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/** A ticket parked in needs_review with one AI draft. */
async function reviewable(orgId: string, channel: 'email' | 'simulator' = 'email') {
  const t = await createInbound(db, {
    orgId,
    channel,
    fromEmail: 'cust@example.com',
    subject: 'Bag arrived torn',
    body: 'The strap is torn.',
    externalThreadId: channel === 'email' ? `thr-${Math.random()}` : null,
    providerMessageId: channel === 'email' ? 'gmail-msg-1' : null,
  });
  const res = await processTicket(deps, t.ticketId);
  expect(res.outcome).toBe('needs_review');
  const { data: d } = await db.from('drafts').select('id').eq('ticket_id', t.ticketId).single();
  return { ticketId: t.ticketId, draftId: d!.id };
}

const outboxFor = async (ticketId: string) => (await db.from('outbox').select('status, body, reply_to_provider_message_id').eq('ticket_id', ticketId)).data ?? [];
const statusOf = async (ticketId: string) => (await db.from('tickets').select('status').eq('id', ticketId).single()).data!.status;
const eventsOf = async (ticketId: string) => ((await db.from('ticket_events').select('type, actor').eq('ticket_id', ticketId)).data ?? []);

let org: string;
let demo: string;
beforeAll(async () => {
  org = await makeOrg();
  demo = await makeOrg(true);
});

describe('review actions', () => {
  it('approve queues an in-thread outbox row and records the actor', async () => {
    const { ticketId, draftId } = await reviewable(org);
    const r = await approveDraft(db, { orgId: org, draftId, actor: 'user:test' });
    expect(r.ok).toBe(true);
    expect(await statusOf(ticketId)).toBe('approved');
    expect(await outboxFor(ticketId)).toEqual([{ status: 'queued', body: 'Sorry to hear that.\n— Test Shop', reply_to_provider_message_id: 'gmail-msg-1' }]);
    expect(await eventsOf(ticketId)).toContainEqual({ type: 'approved', actor: 'user:test' });
  });

  it('a second approve (double tap / dashboard + Telegram) is "already handled" and sends nothing extra', async () => {
    const { ticketId, draftId } = await reviewable(org);
    const [a, b] = await Promise.all([
      approveDraft(db, { orgId: org, draftId, actor: 'user:a' }),
      approveDraft(db, { orgId: org, draftId, actor: 'telegram:1' }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((x) => !x.ok)).toEqual({ ok: false, error: ALREADY_HANDLED });
    expect(await outboxFor(ticketId)).toHaveLength(1);
  });

  it('approve with edits stores a human draft version and sends the edited text', async () => {
    const { ticketId, draftId } = await reviewable(org);
    const r = await approveDraft(db, { orgId: org, draftId, actor: 'user:test', editedBody: 'Edited reply.' });
    expect(r.ok).toBe(true);
    const { data: drafts } = await db.from('drafts').select('version, author, body').eq('ticket_id', ticketId).order('version');
    expect(drafts).toEqual([
      { version: 1, author: 'ai', body: 'Sorry to hear that.\n— Test Shop' },
      { version: 2, author: 'human', body: 'Edited reply.' },
    ]);
    expect((await outboxFor(ticketId))[0].body).toBe('Edited reply.');
  });

  it('cannot approve a stale draft or a draft from another org', async () => {
    const { draftId } = await reviewable(org);
    expect(await approveDraft(db, { orgId: demo, draftId, actor: 'user:x' })).toEqual({ ok: false, error: 'Draft not found.' });
  });

  it('demo org approval never creates an outbox row', async () => {
    const { ticketId, draftId } = await reviewable(demo);
    expect((await approveDraft(db, { orgId: demo, draftId, actor: 'user:test' })).ok).toBe(true);
    expect(await outboxFor(ticketId)).toEqual([]);
  });

  it('simulator ticket approval records a cancelled outbox row the bridge will never claim', async () => {
    const { ticketId, draftId } = await reviewable(org, 'simulator');
    expect((await approveDraft(db, { orgId: org, draftId, actor: 'user:test' })).ok).toBe(true);
    expect((await outboxFor(ticketId)).map((o) => o.status)).toEqual(['cancelled']);
  });

  it('reject requires a reason and blocks later approval', async () => {
    const { ticketId, draftId } = await reviewable(org);
    expect((await rejectTicket(db, { orgId: org, ticketId, actor: 'user:test', reason: '  ' })).ok).toBe(false);
    expect((await rejectTicket(db, { orgId: org, ticketId, actor: 'user:test', reason: 'wrong customer' })).ok).toBe(true);
    expect(await statusOf(ticketId)).toBe('rejected');
    expect((await approveDraft(db, { orgId: org, draftId, actor: 'user:test' })).ok).toBe(false);
  });

  it('regenerate with an instruction makes a new AI draft, back in review, never auto-sent', async () => {
    const { ticketId, draftId } = await reviewable(org);
    const r = await regenerateDraft(deps, { orgId: org, ticketId, actor: 'user:test', instruction: 'Offer to call them' });
    expect(r.ok).toBe(true);
    expect(await statusOf(ticketId)).toBe('needs_review');
    const { data: drafts } = await db.from('drafts').select('version, body').eq('ticket_id', ticketId).order('version');
    expect(drafts?.map((d) => d.body)).toEqual(['Sorry to hear that.\n— Test Shop', 'Steered reply.\n— Test Shop']);
    // The old draft is no longer approvable.
    expect(await approveDraft(db, { orgId: org, draftId, actor: 'user:test' })).toEqual({ ok: false, error: ALREADY_HANDLED });
  });

  it('save as approved answer stores the redacted question and enqueues embedding', async () => {
    const { ticketId, draftId } = await reviewable(org);
    expect((await saveApprovedAnswer(db, { orgId: org, ticketId, actor: 'user:test', userId: '00000000-0000-0000-0000-000000000000' })).ok).toBe(false);
    await approveDraft(db, { orgId: org, draftId, actor: 'user:test' });
    const { data: user } = await db.auth.admin.createUser({ email: `owner-${Date.now()}@example.com`, email_confirm: true });
    const r = await saveApprovedAnswer(db, { orgId: org, ticketId, actor: 'user:test', userId: user.user!.id });
    expect(r.ok).toBe(true);
    const { data: doc } = await db.from('kb_documents').select('id, kind, content').eq('org_id', org).eq('kind', 'approved_answer').single();
    expect(doc?.content).toContain('The strap is torn.');
    const { count } = await db.from('jobs').select('id', { count: 'exact', head: true }).eq('type', 'embed_document').contains('payload', { documentId: doc!.id });
    expect(count).toBe(1);
  });
});
