import 'server-only';
import type { Db } from '@/server/db/admin';

export const RETENTION_DAYS = 180;
export const PURGED = '[deleted after 180 days]';
const DONE_STATUSES = ['closed', 'rejected', 'sent'] as const;

/**
 * Data minimisation: blank the message bodies (raw + redacted + headers) of finished tickets whose
 * last message is older than 180 days. Ticket metadata, classification, gate and audit events stay,
 * so /insights keeps working. Batched to stay inside one tick's time budget; repeated ticks drain the rest.
 */
export async function purgeOldBodies(db: Db, now = Date.now(), batch = 200): Promise<number> {
  const cutoff = new Date(now - RETENTION_DAYS * 86_400_000).toISOString();
  const { data: msgs, error } = await db
    .from('messages')
    .select('id, ticket:tickets!inner(status, last_message_at)')
    .neq('body_text', PURGED)
    .in('ticket.status', DONE_STATUSES)
    .lt('ticket.last_message_at', cutoff)
    .limit(batch);
  if (error) throw error;
  if (!msgs.length) return 0;
  const { error: ue } = await db
    .from('messages')
    .update({ body_text: PURGED, body_redacted: null, headers: {} })
    .in('id', msgs.map((m) => m.id));
  if (ue) throw ue;
  return msgs.length;
}
