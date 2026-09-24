import 'server-only';
import { OrgSettings } from '@/lib/contracts';
import type { Db } from '@/server/db/admin';
import { addEvent } from '@/server/db/repos/tickets';
import { env } from '@/server/env';

// Reviewer notifications via the Telegram Bot API (free). Plain text messages: no parse_mode, so
// customer text can never inject formatting or links.
// ponytail: Telegram is the only notifier; add the email-digest fallback (§2) if Telegram proves unreliable.

const MAX_TEXT = 4000; // Telegram hard limit is 4096

export async function telegram(method: string, body: Record<string, unknown>): Promise<unknown> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
  if (!json.ok) throw new Error(`telegram ${method}: ${res.status} ${json.description ?? ''}`.trim()); // never include the token
  return json.result;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Build the review message. Pure, for tests. */
export function reviewMessage(i: {
  ticketId: string;
  draftId: string | null;
  subject: string | null;
  intent: string | null;
  urgency: string | null;
  riskFlags: string[];
  snippet: string;
  draft: string | null;
  baseUrl: string;
}) {
  const head = [
    `📨 Needs review: ${i.intent?.replaceAll('_', ' ') ?? 'unclassified'}${i.urgency === 'high' ? ' · HIGH urgency' : ''}`,
    i.riskFlags.length ? `⚠️ ${i.riskFlags.join(', ')}` : null,
    `Subject: ${clip(i.subject ?? '(none)', 120)}`,
    '',
    `Customer: ${clip(i.snippet, 600)}`,
    '',
  ].filter((l) => l !== null).join('\n');
  const text = clip(`${head}${i.draft ? `Draft:\n${i.draft}` : 'No draft (AI unavailable) — reply from the dashboard.'}`, MAX_TEXT);
  const row: Record<string, string>[] = [];
  if (i.draftId) row.push({ text: '✅ Approve', callback_data: `a:${i.draftId}` });
  // Telegram only accepts public https URLs in buttons.
  if (i.baseUrl.startsWith('https://')) row.push({ text: '✏️ Open', url: `${i.baseUrl}/tickets/${i.ticketId}` });
  if (i.draftId) row.push({ text: '❌ Reject', callback_data: `r:${i.draftId}` });
  return { text, reply_markup: { inline_keyboard: [row] } };
}

/** Tell the org's reviewers a ticket is waiting. No-op when Telegram isn't configured. */
export async function notifyNeedsReview(db: Db, ticketId: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const { data: t } = await db
    .from('tickets')
    .select('id, org_id, subject, intent, urgency, risk_flags, org:orgs(settings, is_demo)')
    .eq('id', ticketId)
    .single();
  if (!t?.org || t.org.is_demo) return;
  const chatIds = OrgSettings.parse(t.org.settings).telegramChatIds;
  if (!chatIds.length) return;
  const [{ data: msg }, { data: draft }] = await Promise.all([
    db.from('messages').select('body_redacted, body_text').eq('ticket_id', ticketId).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('drafts').select('id, body').eq('ticket_id', ticketId).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const payload = reviewMessage({
    ticketId,
    draftId: draft?.id ?? null,
    subject: t.subject,
    intent: t.intent,
    urgency: t.urgency,
    riskFlags: t.risk_flags,
    snippet: msg?.body_redacted ?? '(redaction pending)', // never the raw body: it may contain phone numbers / trx IDs
    draft: draft?.body ?? null,
    baseUrl: env.APP_BASE_URL,
  });
  for (const chatId of chatIds) await telegram('sendMessage', { chat_id: chatId, ...payload });
  await addEvent(db, { orgId: t.org_id, ticketId, actor: 'system', type: 'notified', data: { channel: 'telegram', chats: chatIds.length } });
}

/** At most once per `reminderAfterMinutes`: tell reviewers how many tickets have waited longer than that. */
export async function remindReviewers(db: Db, orgId: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const { data: org } = await db.from('orgs').select('settings, is_demo').eq('id', orgId).single();
  if (!org || org.is_demo) return false;
  const s = OrgSettings.parse(org.settings);
  if (!s.telegramChatIds.length) return false;
  const cutoff = new Date(Date.now() - s.reminderAfterMinutes * 60_000).toISOString();
  const { count } = await db.from('tickets').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'needs_review').lt('last_message_at', cutoff);
  if (!count) return false;
  const { data: allowed } = await db.rpc('hit_rate_limit', { p_key: `remind:${orgId}`, p_window_seconds: s.reminderAfterMinutes * 60, p_max: 1 });
  if (!allowed) return false;
  const text = `⏰ ${count} ticket${count === 1 ? '' : 's'} waiting for review for over ${s.reminderAfterMinutes} min.`;
  for (const chatId of s.telegramChatIds) await telegram('sendMessage', { chat_id: chatId, text });
  return true;
}
