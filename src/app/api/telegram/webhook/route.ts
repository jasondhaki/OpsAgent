import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { OrgSettings } from '@/lib/contracts';
import { telegram } from '@/server/adapters/notify/telegram';
import { db } from '@/server/db/admin';
import { defaultOrgId } from '@/server/db/repos/orgs';
import { env } from '@/server/env';
import { approveDraft, rejectTicket } from '@/server/review';

const Update = z.object({
  message: z.object({ chat: z.object({ id: z.number() }), text: z.string().optional() }).optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().max(64).optional(),
      message: z.object({ message_id: z.number(), chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
});

function secretOk(given: string | null): boolean {
  const want = env.TELEGRAM_WEBHOOK_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get('x-telegram-bot-api-secret-token'))) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: true }); // ignore update types we don't handle
  const { message, callback_query: cq } = parsed.data;

  // /start: show the chat id so the owner can paste it into Settings. Reveals nothing else.
  if (message?.text?.startsWith('/start')) {
    await telegram('sendMessage', { chat_id: message.chat.id, text: `Your chat ID is ${message.chat.id}. Paste it into OpsAgent → Settings → Telegram chat IDs.` });
    return Response.json({ ok: true });
  }
  if (!cq?.data || !cq.message) return Response.json({ ok: true });

  const chatId = String(cq.message.chat.id);
  const orgId = await defaultOrgId(db);
  const { data: org } = await db.from('orgs').select('settings').eq('id', orgId).single();
  const answer = (text: string) => telegram('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: true });
  if (!OrgSettings.parse(org?.settings ?? {}).telegramChatIds.includes(chatId)) {
    await answer('This chat is not allowed to review tickets.');
    return Response.json({ ok: true });
  }

  const m = /^([ar]):([0-9a-f-]{36})$/.exec(cq.data);
  if (!m) return Response.json({ ok: true });
  const [, op, draftId] = m;
  const actor = `telegram:${chatId}`;
  let result;
  if (op === 'a') {
    result = await approveDraft(db, { orgId, draftId, actor });
  } else {
    const { data: d } = await db.from('drafts').select('ticket_id').eq('id', draftId).eq('org_id', orgId).maybeSingle();
    result = d ? await rejectTicket(db, { orgId, ticketId: d.ticket_id, actor, reason: 'Rejected from Telegram' }) : { ok: false as const, error: 'Draft not found.' };
  }
  await answer(result.ok ? result.message : result.error);
  // Remove the buttons once handled (or already handled elsewhere) so nobody taps twice.
  await telegram('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  return Response.json({ ok: true });
}
