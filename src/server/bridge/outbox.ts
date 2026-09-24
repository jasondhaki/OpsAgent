import 'server-only';
import { z } from 'zod';
import type { Db } from '@/server/db/admin';
import { addEvent } from '@/server/db/repos/tickets';

export const MAX_SEND_ATTEMPTS = 3;
const LEASE_SECONDS = 120;

export const ClaimRequest = z.object({ limit: z.number().int().min(1).max(20).default(10) });
export const AckRequest = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        ok: z.boolean(),
        sentRef: z.string().max(200).nullish(), // Gmail message/thread id of the sent reply
        error: z.string().max(500).nullish(),
      }),
    )
    .max(20),
});

export type ClaimedItem = { id: string; to: string; subject: string | null; body: string; replyToProviderMessageId: string | null };

/**
 * Lease up to `limit` queued emails, never exceeding `dailyCap` sends in a rolling 24 h
 * (Gmail consumer quota is ~100 recipients/day; each item is one recipient).
 */
export async function claimOutbox(db: Db, orgId: string, limit: number, dailyCap: number): Promise<ClaimedItem[]> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: sent }, { count: inFlight }] = await Promise.all([
    db.from('outbox').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'sent').gte('sent_at', since),
    db.from('outbox').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'claimed').gt('claimed_until', new Date().toISOString()),
  ]);
  const room = dailyCap - (sent ?? 0) - (inFlight ?? 0);
  if (room <= 0) return [];
  const { data, error } = await db.rpc('claim_outbox', { p_org_id: orgId, p_limit: Math.min(limit, room), p_lease_seconds: LEASE_SECONDS });
  if (error) throw error;
  return data.map((o) => ({ id: o.id, to: o.to_address, subject: o.subject, body: o.body, replyToProviderMessageId: o.reply_to_provider_message_id }));
}

/**
 * Record send results. Idempotent: re-acking a sent item is a no-op (the bridge re-acks after a
 * crash between send and ack). A failure is retried until MAX_SEND_ATTEMPTS, then surfaced.
 */
export async function ackOutbox(db: Db, orgId: string, items: z.infer<typeof AckRequest>['items']): Promise<{ id: string; result: string }[]> {
  const results: { id: string; result: string }[] = [];
  for (const item of items) {
    const { data: row } = await db.from('outbox').select('id, ticket_id, status, attempts, body').eq('id', item.id).eq('org_id', orgId).maybeSingle();
    if (!row) {
      results.push({ id: item.id, result: 'unknown' });
      continue;
    }
    if (row.status === 'sent') {
      results.push({ id: item.id, result: 'already_sent' });
      continue;
    }
    if (row.status !== 'claimed' && !(item.ok && row.status === 'failed')) {
      results.push({ id: item.id, result: `ignored_${row.status}` });
      continue;
    }
    const now = new Date().toISOString();
    if (item.ok) {
      const { data: upd } = await db
        .from('outbox')
        .update({ status: 'sent', sent_at: now, sent_ref: item.sentRef ?? null, claimed_until: null, last_error: null })
        .eq('id', row.id)
        .neq('status', 'sent')
        .select('id');
      if (!upd?.length) {
        results.push({ id: item.id, result: 'already_sent' });
        continue;
      }
      await db.from('tickets').update({ status: 'sent', updated_at: now }).eq('id', row.ticket_id).eq('status', 'approved');
      await db.from('messages').insert({ org_id: orgId, ticket_id: row.ticket_id, direction: 'outbound', body_text: row.body, provider_message_id: item.sentRef ?? null });
      await addEvent(db, { orgId, ticketId: row.ticket_id, actor: 'bridge', type: 'sent', data: { outboxId: row.id, sentRef: item.sentRef ?? null } });
      results.push({ id: item.id, result: 'sent' });
    } else {
      const giveUp = row.attempts >= MAX_SEND_ATTEMPTS;
      await db
        .from('outbox')
        .update({ status: giveUp ? 'failed' : 'queued', claimed_until: null, last_error: item.error ?? 'send failed' })
        .eq('id', row.id)
        .eq('status', 'claimed');
      if (giveUp) await surfaceFailure(db, orgId, row.ticket_id, row.id, item.error ?? 'send failed');
      results.push({ id: item.id, result: giveUp ? 'failed' : 'retry' });
    }
  }
  return results;
}

async function surfaceFailure(db: Db, orgId: string, ticketId: string, outboxId: string, error: string) {
  // 'error' shows in the queue; a reviewer can regenerate or reject from there.
  await db.from('tickets').update({ status: 'error', requires_human: true, updated_at: new Date().toISOString() }).eq('id', ticketId);
  await addEvent(db, { orgId, ticketId, actor: 'bridge', type: 'send_failed', data: { outboxId, error: error.slice(0, 300) } });
}

/** Leases that expired after the last allowed attempt: the bridge died repeatedly mid-send. Mark failed and surface. */
export async function reapStaleClaims(db: Db): Promise<number> {
  const { data } = await db
    .from('outbox')
    .update({ status: 'failed', claimed_until: null, last_error: 'lease expired after max attempts' })
    .eq('status', 'claimed')
    .lt('claimed_until', new Date().toISOString())
    .gte('attempts', MAX_SEND_ATTEMPTS)
    .select('id, org_id, ticket_id');
  for (const o of data ?? []) await surfaceFailure(db, o.org_id, o.ticket_id, o.id, 'lease expired after max attempts');
  return data?.length ?? 0;
}
