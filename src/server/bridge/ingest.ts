import 'server-only';
import type { IngestPayload } from '@/lib/contracts';
import type { Db } from '@/server/db/admin';
import { addEvent, createInbound } from '@/server/db/repos/tickets';
import { enqueueJob } from '@/server/jobs/queue';

/** Bare address from `Name <a@b.c>` or `a@b.c`; null if none. */
export function parseAddress(from: string): string | null {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from) ?? /([^\s<>"]+@[^\s<>"]+)/.exec(from);
  return m ? m[1].toLowerCase() : null;
}

const header = (h: Record<string, string>, name: string) => {
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? h[k].trim() : undefined;
};

/**
 * Why this message must never get a reply (auto-replies, bulk mail, bounces, our own mail), or null.
 * Replying to these is how mail loops start. `X-OpsAgent-Account` is added by the bridge (the Gmail account it runs as).
 */
export function automatedReason(p: Pick<IngestPayload, 'from' | 'headers'>): string | null {
  const h = p.headers;
  const from = parseAddress(p.from) ?? '';
  const auto = header(h, 'Auto-Submitted');
  if (auto && auto.toLowerCase() !== 'no') return 'auto_submitted';
  if (['bulk', 'junk', 'list'].includes((header(h, 'Precedence') ?? '').toLowerCase())) return 'precedence';
  if (header(h, 'List-Id')) return 'mailing_list';
  if (header(h, 'X-Autoreply') || header(h, 'X-Autorespond')) return 'autoreply';
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/.test(from)) return 'system_sender';
  const account = header(h, 'X-OpsAgent-Account')?.toLowerCase();
  if (account && from === account) return 'own_address';
  return null;
}

export type IngestResult = { status: 'duplicate' | 'filtered' | 'blocked' | 'queued'; ticketId?: string; reason?: string };

export async function ingestEmail(db: Db, orgId: string, p: IngestPayload): Promise<IngestResult> {
  const { data: dup } = await db.from('messages').select('ticket_id').eq('org_id', orgId).eq('external_message_id', p.rfcMessageId).maybeSingle();
  if (dup) return { status: 'duplicate', ticketId: dup.ticket_id };

  const fromEmail = parseAddress(p.from);
  const reason = fromEmail ? automatedReason(p) : 'no_sender';
  let inbound;
  try {
    inbound = await createInbound(db, {
      orgId,
      channel: 'email',
      fromEmail: fromEmail ?? 'unknown@invalid',
      subject: p.subject || null,
      body: p.plainBody,
      // An out-of-office reply inside a live customer thread must not reset or close that ticket:
      // automated mail gets its own (closed) ticket instead.
      externalThreadId: reason ? null : p.gmailThreadId,
      externalMessageId: p.rfcMessageId,
      providerMessageId: p.gmailMessageId,
      headers: p.headers,
    });
  } catch (e) {
    // Two overlapping bridge runs posting the same message: the unique index is the real dedupe.
    if ((e as { code?: string }).code === '23505') return { status: 'duplicate' };
    throw e;
  }
  const { ticketId } = inbound;

  if (reason || inbound.customerBlocked) {
    await db.from('tickets').update({ status: 'closed', requires_human: false }).eq('id', ticketId);
    await addEvent(db, { orgId, ticketId, actor: 'bridge', type: reason ? 'filtered_automated' : 'filtered_blocked', data: { reason: reason ?? 'blocked' } });
    return { status: reason ? 'filtered' : 'blocked', ticketId, reason: reason ?? 'blocked' };
  }
  await enqueueJob(db, { orgId, type: 'process_ticket', payload: { ticketId } });
  return { status: 'queued', ticketId };
}
