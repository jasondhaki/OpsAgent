'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentMembership, requireMember } from '@/server/auth/requireMember';
import { db } from '@/server/db/admin';
import { createInbound } from '@/server/db/repos/tickets';
import { pipelineDeps } from '@/server/deps';
import { processTicket, type ProcessResult } from '@/server/pipeline/orchestrator';
import { allow } from '@/server/security/rateLimit';

export type SimState = { ok: true; ticketId: string; result: ProcessResult; ms: number } | { ok: false; error: string } | null;

const Input = z.object({
  from: z.email().max(320),
  subject: z.string().max(200),
  body: z.string().trim().min(1, 'Write a message first.').max(8000),
});

/** Runs the real pipeline in dry-run mode on a simulator ticket; the ticket then sits in the queue for review. */
export async function simulateAction(_: SimState, form: FormData): Promise<SimState> {
  const m0 = await currentMembership();
  if (!m0) throw new Error('forbidden');
  const m = await requireMember(m0.orgId, 'reviewer');
  const parsed = Input.safeParse({ from: form.get('from'), subject: form.get('subject') ?? '', body: form.get('body') ?? '' });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  // Protects the shared free-tier AI quota from a stuck finger or a script.
  if (!(await allow(db, `sim:user:${m.userId}`, 86_400, 50))) return { ok: false, error: 'Simulator limit reached (50 runs/day).' };
  const started = Date.now();
  const t = await createInbound(db, { orgId: m.orgId, channel: 'simulator', fromEmail: parsed.data.from, subject: parsed.data.subject || null, body: parsed.data.body });
  const result = await processTicket(pipelineDeps(), t.ticketId, { dryRun: true, deadlineMs: Date.now() + 60_000 });
  revalidatePath('/queue');
  return { ok: true, ticketId: t.ticketId, result, ms: Date.now() - started };
}
