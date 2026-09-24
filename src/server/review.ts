import 'server-only';
import type { Db } from '@/server/db/admin';
import { addEvent } from '@/server/db/repos/tickets';
import { enqueueJob } from '@/server/jobs/queue';
import { processTicket, type PipelineDeps } from '@/server/pipeline/orchestrator';
import { findPlaceholders } from '@/lib/placeholders';

// Review actions shared by dashboard Server Actions and (Phase 4) Telegram callbacks.
// Callers authorize first; these functions trust `orgId` + `actor` and scope every query by org.

export type ReviewResult = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): ReviewResult => ({ ok: false, error });
export const ALREADY_HANDLED = 'Already handled — reload to see the latest state.';

/**
 * Approve the latest draft (optionally edited → new human draft version) and enqueue the reply.
 * Optimistic concurrency: only a `needs_review` ticket whose latest draft is `draftId` can be approved.
 */
export async function approveDraft(
  db: Db,
  i: { orgId: string; draftId: string; actor: string; userId?: string | null; editedBody?: string | null },
): Promise<ReviewResult> {
  const { data: draft } = await db
    .from('drafts')
    .select('id, version, body, language, citations, ticket:tickets(id, status, channel, subject, customer:customers(email)), org:orgs(is_demo)')
    .eq('id', i.draftId)
    .eq('org_id', i.orgId)
    .maybeSingle();
  if (!draft?.ticket) return fail('Draft not found.');
  const ticket = draft.ticket;
  const { data: latest } = await db.from('drafts').select('id').eq('ticket_id', ticket.id).order('version', { ascending: false }).limit(1).single();
  if (latest?.id !== draft.id || ticket.status !== 'needs_review') return fail(ALREADY_HANDLED);
  const to = ticket.customer?.email;
  if (!to) return fail('Ticket has no customer email.');

  const edited = i.editedBody == null ? null : i.editedBody.trim();
  if (edited === '') return fail('Reply cannot be empty.');
  const isEdit = edited !== null && edited !== draft.body.trim();

  // Claim the ticket first so two reviewers (or dashboard + Telegram) cannot both approve.
  const { data: claimed } = await db
    .from('tickets')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', ticket.id)
    .eq('status', 'needs_review')
    .select('id');
  if (!claimed?.length) return fail(ALREADY_HANDLED);

  try {
    let finalId = draft.id;
    let body = draft.body;
    if (isEdit) {
      const { data: ins, error } = await db
        .from('drafts')
        .insert({
          org_id: i.orgId,
          ticket_id: ticket.id,
          version: draft.version + 1,
          body: edited,
          language: draft.language,
          citations: draft.citations,
          author: 'human',
          created_by: i.userId ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      finalId = ins.id;
      body = edited;
      await addEvent(db, { orgId: i.orgId, ticketId: ticket.id, actor: i.actor, type: 'edited', data: { fromDraftId: draft.id, draftId: finalId } });
    }

    let note = 'Approved — reply queued for sending.';
    if (draft.org?.is_demo) {
      note = 'Approved (demo org: nothing is ever sent).'; // the DB trigger would reject an outbox row anyway (rule 7)
    } else {
      // Simulator tickets get an outbox row for the audit trail, cancelled so the bridge never sends it.
      const simulated = ticket.channel === 'simulator';
      const { error } = await db.from('outbox').insert({
        org_id: i.orgId,
        ticket_id: ticket.id,
        draft_id: finalId,
        to_address: to,
        subject: ticket.subject ? `Re: ${ticket.subject.replace(/^re:\s*/i, '')}` : null,
        reply_to_provider_message_id: await latestProviderMessageId(db, ticket.id),
        body,
        ...(simulated ? { status: 'cancelled' as const, last_error: 'simulator ticket: never sent' } : {}),
      });
      if (error) throw error;
      if (simulated) note = 'Approved — simulator ticket, so the outbox row is recorded but never sent.';
    }
    await addEvent(db, { orgId: i.orgId, ticketId: ticket.id, actor: i.actor, type: 'approved', data: { draftId: finalId, edited: isEdit } });
    return { ok: true, message: note };
  } catch (e) {
    await db.from('tickets').update({ status: 'needs_review' }).eq('id', ticket.id).eq('status', 'approved');
    throw e;
  }
}

async function latestProviderMessageId(db: Db, ticketId: string): Promise<string | null> {
  const { data } = await db
    .from('messages')
    .select('provider_message_id')
    .eq('ticket_id', ticketId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.provider_message_id ?? null;
}

export async function rejectTicket(db: Db, i: { orgId: string; ticketId: string; actor: string; reason: string }): Promise<ReviewResult> {
  const reason = i.reason.trim().slice(0, 500);
  if (!reason) return fail('A reason is required.');
  const { data } = await db
    .from('tickets')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', i.ticketId)
    .eq('org_id', i.orgId)
    .in('status', ['needs_review', 'error'])
    .select('id');
  if (!data?.length) return fail(ALREADY_HANDLED);
  await addEvent(db, { orgId: i.orgId, ticketId: i.ticketId, actor: i.actor, type: 'rejected', data: { reason } });
  return { ok: true, message: 'Rejected.' };
}

/** New AI draft from the stored classification, optionally steered by a (trusted) reviewer instruction. Always lands back in review. */
export async function regenerateDraft(
  deps: PipelineDeps,
  i: { orgId: string; ticketId: string; actor: string; instruction?: string | null },
): Promise<ReviewResult> {
  const { db } = deps;
  const instruction = i.instruction?.trim().slice(0, 500) || null;
  const { data } = await db
    .from('tickets')
    .update({ status: 'processing', pipeline_step: 'classified', updated_at: new Date().toISOString() })
    .eq('id', i.ticketId)
    .eq('org_id', i.orgId)
    .not('classification', 'is', null)
    .in('status', ['needs_review', 'error'])
    .select('id');
  if (!data?.length) return fail(ALREADY_HANDLED);
  await addEvent(db, { orgId: i.orgId, ticketId: i.ticketId, actor: i.actor, type: 'regenerate_requested', data: { instruction } });
  try {
    // dryRun: a regenerated draft is never auto-sent; the orchestrator parks it in needs_review.
    const res = await processTicket(deps, i.ticketId, { dryRun: true, reviewerInstruction: instruction, deadlineMs: Date.now() + 25_000 });
    if (res.outcome === 'deferred') {
      await db.from('tickets').update({ status: 'needs_review' }).eq('id', i.ticketId);
      return fail('Ran out of time — try again.');
    }
    return res.reason === 'ai_unavailable' ? fail('AI providers unavailable — edit the draft by hand.') : { ok: true, message: 'New draft ready.' };
  } catch (e) {
    await db.from('tickets').update({ status: 'needs_review' }).eq('id', i.ticketId).eq('status', 'processing');
    throw e;
  }
}

/**
 * Owner-only and always manual (prevents KB poisoning): store the redacted customer question and
 * the final reply as an approved answer, then enqueue embedding.
 */
export async function saveApprovedAnswer(db: Db, i: { orgId: string; ticketId: string; actor: string; userId: string }): Promise<ReviewResult> {
  const { data: t } = await db.from('tickets').select('id, status, subject').eq('id', i.ticketId).eq('org_id', i.orgId).maybeSingle();
  if (!t || !['approved', 'sent'].includes(t.status)) return fail('Only approved or sent tickets can become approved answers.');
  const [{ data: msg }, { data: draft }] = await Promise.all([
    db.from('messages').select('body_redacted, body_text').eq('ticket_id', t.id).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(1).single(),
    db.from('drafts').select('body, language').eq('ticket_id', t.id).order('version', { ascending: false }).limit(1).single(),
  ]);
  if (!msg || !draft) return fail('Missing message or draft.');
  const question = msg.body_redacted ?? msg.body_text;
  const content = `Q: ${question.slice(0, 2000)}\n\nA: ${draft.body}`;
  if (findPlaceholders(content).length) return fail('Reply still contains {{PLACEHOLDERS}}.');
  const language = draft.language === 'bn' || draft.language === 'en' ? draft.language : 'mixed';
  const { data: doc, error } = await db
    .from('kb_documents')
    .insert({ org_id: i.orgId, title: `Approved answer: ${(t.subject ?? question).slice(0, 80)}`, kind: 'approved_answer', language, content, created_by: i.userId })
    .select('id')
    .single();
  if (error) throw error;
  await enqueueJob(db, { orgId: i.orgId, type: 'embed_document', payload: { documentId: doc.id } });
  await addEvent(db, { orgId: i.orgId, ticketId: t.id, actor: i.actor, type: 'saved_as_approved_answer', data: { documentId: doc.id } });
  return { ok: true, message: 'Saved to the knowledge base (embedding queued).' };
}
