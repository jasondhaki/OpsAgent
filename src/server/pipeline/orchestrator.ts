import 'server-only';
import { z } from 'zod';
import { Classification, DraftOutput, GroundednessReport, OrgSettings, ValidatorReport, type GateDecision } from '@/lib/contracts';
import type { Database, Json } from '@/lib/database.types';
import type { Db } from '@/server/db/admin';
import type { Embedder } from '@/server/ai/embed';
import type { Llm, Tier } from '@/server/ai/providers';
import type { OrderLookup } from '@/server/adapters/orders/types';
import { INTENT_GUIDANCE } from '@/server/ai/prompts/draft.v1';
import { addEvent } from '@/server/db/repos/tickets';
import { redact } from './redact';
import { ruleFlags } from './rules';
import { classify } from './classify';
import { searchKb, type RetrievedChunk } from './retrieve';
import { draftReply, DRAFT_PROMPT_VERSION } from './draft';
import { RAG_INTENTS, validateDraft } from './validate';
import { checkGroundedness } from './groundedness';
import { evaluateGate } from './gate';

export type PipelineDeps = { db: Db; llm: Llm; embedder: Embedder; orders: OrderLookup };
export type TraceStep = { step: string; ms: number; data: unknown };
export type ProcessResult = {
  outcome: 'needs_review' | 'approved' | 'closed' | 'deferred';
  reason?: string;
  trace: TraceStep[];
  classification?: Classification;
  draft?: { body: string; tier: Tier | null; needsHumanBecause: string | null };
  gate?: GateDecision;
};

type TicketUpdate = Database['public']['Tables']['tickets']['Update'];

const MIN_CONTEXT_SIMILARITY = 0.5;
const ORDER_LOOKUPS_PER_DAY = 3;

const DraftMeta = z.object({
  tier: z.enum(['primary', 'fallback']).nullable().default(null),
  model: z.string().optional(),
  needsHumanBecause: z.string().nullable().default(null),
});

type Ctx = {
  chunks: RetrievedChunk[];
  topSimilarity: number | null;
  facts: Record<string, unknown> | null;
  orderVerified: boolean;
};

/**
 * Run (or resume) the pipeline for one ticket. Each step persists its output and an event.
 * dryRun: never creates outbox rows (simulator / evals). Returns a trace for the UI.
 */
export async function processTicket(
  deps: PipelineDeps,
  ticketId: string,
  { dryRun = false, deadlineMs = Date.now() + 25_000 }: { dryRun?: boolean; deadlineMs?: number } = {},
): Promise<ProcessResult> {
  const { db, llm } = deps;
  const trace: TraceStep[] = [];
  const timed = async <T>(step: string, fn: () => Promise<T>, summarize: (v: T) => unknown = (v) => v): Promise<T> => {
    const t = Date.now();
    const v = await fn();
    trace.push({ step, ms: Date.now() - t, data: summarize(v) });
    return v;
  };

  const { data: ticket, error } = await db
    .from('tickets')
    .select('*, org:orgs(id, is_demo, settings), customer:customers(email, is_blocked)')
    .eq('id', ticketId)
    .single();
  if (error) throw error;
  if (!ticket.org) throw new Error('ticket has no org');
  const org = ticket.org;
  const settings = OrgSettings.parse(org.settings);
  const ev = (type: string, data: Json = {}, actor = 'system') => addEvent(db, { orgId: org.id, ticketId, actor, type, data });
  const setTicket = async (patch: TicketUpdate) => {
    const { error: e } = await db.from('tickets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', ticketId);
    if (e) throw e;
  };
  const toReview = async (reason: string, extra: TicketUpdate = {}): Promise<ProcessResult> => {
    await setTicket({ status: 'needs_review', requires_human: true, ...extra });
    return { outcome: 'needs_review', reason, trace };
  };
  const overBudget = () => Date.now() > deadlineMs;

  const { data: msg, error: me } = await db
    .from('messages')
    .select('id, body_text, body_redacted, from_address, provider_message_id')
    .eq('ticket_id', ticketId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (me) throw me;

  await setTicket({ status: 'processing' });

  // 1. Redact + deterministic rules (cheap; recomputed on resume).
  const red = redact(msg.body_text);
  if (msg.body_redacted !== red.redacted) await db.from('messages').update({ body_redacted: red.redacted }).eq('id', msg.id);
  const flags = ruleFlags(`${ticket.subject ?? ''}\n${msg.body_text}`);
  trace.push({ step: 'redact_rules', ms: 0, data: { redacted: red.redacted, found: red.found, orderRefs: red.orderRefs.length, ruleFlags: flags } });

  // 2. Classify (skipped when already persisted).
  let cls: Classification;
  if (ticket.classification) {
    cls = Classification.parse(ticket.classification);
  } else {
    const r = await timed('classify', () => classify(llm, { subject: ticket.subject, redactedBody: red.redacted, orgId: org.id, ticketId }), (r) =>
      r.ok ? { ...r.value, tier: r.tier, model: r.model } : { error: r.error },
    );
    if (!r.ok) {
      await ev('ai_unavailable', { step: 'classify', error: r.error.slice(0, 500) });
      return toReview('ai_unavailable');
    }
    cls = r.value;
    const riskFlags = [...new Set([...flags, ...cls.riskFlags])];
    await setTicket({
      classification: cls as unknown as Json,
      intent: cls.intent,
      urgency: cls.urgency,
      sentiment: cls.sentiment,
      language: cls.language,
      risk_flags: riskFlags,
      lead: cls.intent === 'custom_bulk_order' ? (cls.lead as Json) : null,
      pipeline_step: 'classified',
    });
    await ev('classified', { intent: cls.intent, riskFlags, tier: r.tier, model: r.model }, 'ai');
  }
  const riskFlags = [...new Set([...flags, ...cls.riskFlags])];

  if (cls.intent === 'spam') {
    await setTicket({ status: 'closed', requires_human: false });
    await ev('closed_spam');
    return { outcome: 'closed', reason: 'spam', trace, classification: cls };
  }
  if (overBudget()) return { outcome: 'deferred', trace, classification: cls };

  // 3. Route & gather context.
  const ctx = await timed('context', () => gatherContext(deps, { orgId: org.id, cls, red, sender: msg.from_address }), (c) => ({
    chunks: c.chunks.map((x) => ({ id: x.chunkId, title: x.title, similarity: Number(x.similarity.toFixed(3)) })),
    topSimilarity: c.topSimilarity,
    facts: c.facts,
    orderVerified: c.orderVerified,
  }));
  await ev('context_gathered', { topSimilarity: ctx.topSimilarity, chunkIds: ctx.chunks.map((c) => c.chunkId), orderVerified: ctx.orderVerified });
  if (overBudget()) return { outcome: 'deferred', trace, classification: cls };

  // 4. Draft (reuse the latest AI draft when resuming after 'drafted').
  const replyLanguage: 'bn' | 'en' = settings.replyLanguage === 'mirror' ? (cls.language === 'en' ? 'en' : 'bn') : settings.replyLanguage;
  const allowedUrls = [...settings.allowedUrls, settings.storefrontUrl, settings.bookingUrl].filter((u): u is string => !!u);
  let draftRow: { id: string; body: string; version: number; citations: Json; meta: Json } | null = null;
  if (ticket.pipeline_step === 'drafted' || ticket.pipeline_step === 'gated') {
    const { data } = await db.from('drafts').select('id, body, version, citations, meta').eq('ticket_id', ticketId).eq('author', 'ai').order('version', { ascending: false }).limit(1).maybeSingle();
    draftRow = data;
  }
  if (!draftRow) {
    const r = await timed(
      'draft',
      () =>
        draftReply(llm, {
          subject: ticket.subject,
          redactedBody: red.redacted,
          intent: cls.intent,
          language: cls.language,
          replyLanguage,
          chunks: ctx.chunks.map((c) => ({ id: c.chunkId, title: c.title, content: c.content })),
          facts: ctx.facts,
          intentGuidance: INTENT_GUIDANCE[cls.intent] ?? INTENT_GUIDANCE.other,
          signature: settings.signature,
          allowedUrls,
          orgId: org.id,
          ticketId,
        }),
      (r) => (r.ok ? { ...r.value, tier: r.tier, model: r.model } : { error: r.error }),
    );
    if (!r.ok) {
      await ev('ai_unavailable', { step: 'draft', error: r.error.slice(0, 500) });
      return { ...(await toReview('ai_unavailable')), classification: cls };
    }
    const d: DraftOutput = r.value;
    const { data: last } = await db.from('drafts').select('version').eq('ticket_id', ticketId).order('version', { ascending: false }).limit(1).maybeSingle();
    const citations = d.citedChunkIds.map((id) => {
      const c = ctx.chunks.find((x) => x.chunkId === id);
      return { chunkId: id, title: c?.title ?? null, similarity: c?.similarity ?? null };
    });
    const { data: ins, error: de } = await db
      .from('drafts')
      .insert({
        org_id: org.id,
        ticket_id: ticketId,
        version: (last?.version ?? 0) + 1,
        body: d.reply,
        language: d.language,
        citations: citations as Json,
        author: 'ai',
        meta: { tier: r.tier, provider: r.provider, model: r.model, promptVersion: DRAFT_PROMPT_VERSION, needsHumanBecause: d.needsHumanBecause },
      })
      .select('id, body, version, citations, meta')
      .single();
    if (de) throw de;
    draftRow = ins;
    await setTicket({ pipeline_step: 'drafted' });
    await ev('drafted', { draftId: ins.id, version: ins.version, tier: r.tier, model: r.model }, 'ai');
  }
  const meta = DraftMeta.parse(draftRow.meta);
  const citedIds = z.array(z.object({ chunkId: z.string() })).parse(draftRow.citations).map((c) => c.chunkId);

  // 5. Validate (deterministic).
  const contextText = [...ctx.chunks.map((c) => c.content), ctx.facts ? JSON.stringify(ctx.facts) : '', settings.signature].join('\n\n');
  const validator: ValidatorReport = validateDraft({
    reply: draftRow.body,
    intent: cls.intent,
    expectedLanguage: replyLanguage,
    context: contextText,
    citedChunkIds: citedIds,
    retrievedChunkIds: ctx.chunks.map((c) => c.chunkId),
    allowedUrls,
  });
  trace.push({ step: 'validate', ms: 0, data: validator });

  // 6. Gate inputs; groundedness only when everything else would pass (also in shadow mode).
  const { count: autoReplies } = await db
    .from('ticket_events')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', ticketId)
    .eq('type', 'autosent')
    .gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
  const gateInput = {
    intent: cls.intent,
    riskFlags,
    sentiment: cls.sentiment,
    urgency: cls.urgency,
    topSimilarity: ctx.topSimilarity,
    orderVerified: ctx.orderVerified,
    validator,
    groundedness: null as GroundednessReport | null,
    needsHumanBecause: meta.needsHumanBecause,
    autoRepliesInThread24h: autoReplies ?? 0,
    draftTier: meta.tier,
    customerBlocked: ticket.customer?.is_blocked ?? false,
    settings,
    isDemo: org.is_demo,
  };
  if (evaluateGate({ ...gateInput, groundedness: { verdict: 'supported', unsupportedClaims: [] } }).wouldAutosend && !overBudget()) {
    const g = await timed('groundedness', () => checkGroundedness(llm, { context: contextText, reply: draftRow.body, orgId: org.id, ticketId }), (r) =>
      r.ok ? r.value : { error: r.error },
    );
    if (g.ok) gateInput.groundedness = g.value;
  }
  await db.from('drafts').update({ validator: validator as Json, groundedness: (gateInput.groundedness as Json) ?? null }).eq('id', draftRow.id);

  // 7. Gate (pure) and act.
  const gate = evaluateGate(gateInput);
  trace.push({ step: 'gate', ms: 0, data: gate });
  await ev('gate_evaluated', { wouldAutosend: gate.wouldAutosend, autosend: gate.autosend, failed: gate.checks.filter((c) => !c.passed).map((c) => c.id) });
  const result = { trace, classification: cls, draft: { body: draftRow.body, tier: meta.tier, needsHumanBecause: meta.needsHumanBecause }, gate };

  if (gate.autosend && !dryRun && ticket.customer?.email) {
    const { error: oe } = await db.from('outbox').insert({
      org_id: org.id,
      ticket_id: ticketId,
      draft_id: draftRow.id,
      to_address: ticket.customer.email,
      reply_to_provider_message_id: msg.provider_message_id,
      subject: ticket.subject ? `Re: ${ticket.subject.replace(/^re:\s*/i, '')}` : null,
      body: draftRow.body,
    });
    if (oe) throw oe;
    await setTicket({ status: 'approved', requires_human: false, gate: gate as Json, pipeline_step: 'gated' });
    await ev('autosent', { draftId: draftRow.id });
    return { ...result, outcome: 'approved' };
  }
  // ponytail: reviewer notification (Telegram) lands in Phase 4.
  await setTicket({ status: 'needs_review', requires_human: true, gate: gate as Json, pipeline_step: 'gated' });
  return { ...result, outcome: 'needs_review' };
}

async function gatherContext(
  deps: PipelineDeps,
  i: { orgId: string; cls: Classification; red: { redacted: string; orderRefs: string[] }; sender: string | null },
): Promise<Ctx> {
  const { db, embedder, orders } = deps;
  const { cls } = i;

  if ((RAG_INTENTS as readonly string[]).includes(cls.intent)) {
    const query = [i.red.redacted, ...cls.productMentions].join('\n');
    const all = await searchKb(db, embedder, i.orgId, query, 6);
    const chunks = all.filter((c) => c.similarity >= MIN_CONTEXT_SIMILARITY);
    let facts: Record<string, unknown> | null = null;
    // Only letters/digits/spaces reach the PostgREST filter (mentions derive from customer text).
    const terms = cls.productMentions.map((m) => m.replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 40)).filter((m) => m.length >= 3);
    if (terms.length) {
      const { data } = await db
        .from('products_cache')
        .select('name, price_minor, currency, in_stock, attributes, url')
        .eq('org_id', i.orgId)
        .or(terms.map((t) => `name.ilike.%${t}%`).join(','))
        .limit(5);
      if (data?.length) {
        facts = {
          products: data.map((p) => ({
            name: p.name,
            price: p.price_minor === null ? null : `${p.price_minor / 100} ${p.currency}`,
            inStock: p.in_stock,
            attributes: p.attributes,
            url: p.url,
          })),
        };
      }
    }
    return { chunks, topSimilarity: all[0]?.similarity ?? null, facts, orderVerified: false };
  }

  if (cls.intent === 'order_status') {
    const ref = i.red.orderRefs[0] ?? (cls.orderRef && !cls.orderRef.includes('[') ? cls.orderRef.toUpperCase() : null);
    const none = (orderLookup: string): Ctx => ({ chunks: [], topSimilarity: null, facts: { orderLookup }, orderVerified: false });
    if (!ref) return none('no_order_number_given');
    const { data: allowed, error } = await db.rpc('hit_rate_limit', { p_key: `order:${i.orgId}:${ref}`, p_window_seconds: 86_400, p_max: ORDER_LOOKUPS_PER_DAY });
    if (error) throw error;
    if (!allowed) return none('too_many_lookups_today');
    const order = await orders.find(ref);
    if (!order) return none('order_not_found');
    if (!i.sender || order.emailOnFile.toLowerCase() !== i.sender.toLowerCase()) {
      // Never disclose to a different sender. ponytail: sending the status to the email on file lands with the outbox work in Phase 4.
      return none('not_verified_for_this_sender');
    }
    return {
      chunks: [],
      topSimilarity: null,
      facts: { order: { orderRef: order.orderRef, status: order.status, updatedAt: order.updatedAt, items: order.itemsSummary } },
      orderVerified: true,
    };
  }

  return { chunks: [], topSimilarity: null, facts: null, orderVerified: false };
}
