'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentMembership, requireMember, type Role } from '@/server/auth/requireMember';
import { db } from '@/server/db/admin';
import { pipelineDeps } from '@/server/deps';
import { approveDraft, regenerateDraft, rejectTicket, saveApprovedAnswer, type ReviewResult } from '@/server/review';

export type ActionState = ReviewResult | null;

// Every action re-checks membership; review.ts then scopes all queries to that org.
async function member(role: Role) {
  const m = await currentMembership();
  if (!m) throw new Error('forbidden');
  return requireMember(m.orgId, role);
}

const done = (ticketId: string, r: ReviewResult) => {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath('/queue');
  return r;
};

const Approve = z.object({ ticketId: z.uuid(), draftId: z.uuid(), body: z.string().max(4000).optional() });
export async function approveAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await member('reviewer');
  const i = Approve.parse({ ticketId: form.get('ticketId'), draftId: form.get('draftId'), body: form.get('body') ?? undefined });
  return done(i.ticketId, await approveDraft(db, { orgId: m.orgId, draftId: i.draftId, actor: `user:${m.userId}`, userId: m.userId, editedBody: i.body ?? null }));
}

const Reject = z.object({ ticketId: z.uuid(), reason: z.string().max(500) });
export async function rejectAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await member('reviewer');
  const i = Reject.parse({ ticketId: form.get('ticketId'), reason: form.get('reason') ?? '' });
  return done(i.ticketId, await rejectTicket(db, { orgId: m.orgId, ticketId: i.ticketId, actor: `user:${m.userId}`, reason: i.reason }));
}

const Regenerate = z.object({ ticketId: z.uuid(), instruction: z.string().max(500) });
export async function regenerateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await member('reviewer');
  const i = Regenerate.parse({ ticketId: form.get('ticketId'), instruction: form.get('instruction') ?? '' });
  return done(i.ticketId, await regenerateDraft(pipelineDeps(), { orgId: m.orgId, ticketId: i.ticketId, actor: `user:${m.userId}`, instruction: i.instruction }));
}

export async function saveAnswerAction(_: ActionState, form: FormData): Promise<ActionState> {
  const m = await member('owner');
  const ticketId = z.uuid().parse(form.get('ticketId'));
  return done(ticketId, await saveApprovedAnswer(db, { orgId: m.orgId, ticketId, actor: `user:${m.userId}`, userId: m.userId }));
}
