'use server';

import { revalidatePath } from 'next/cache';
import { AUTOSEND_INTENTS, OrgSettings } from '@/lib/contracts';
import type { Json } from '@/lib/database.types';
import { currentMembership, requireMember } from '@/server/auth/requireMember';
import { db } from '@/server/db/admin';

export type SettingsState = { ok: true; message: string } | { ok: false; error: string } | null;

const lines = (v: FormDataEntryValue | null) => String(v ?? '').split(/\s+/).map((s) => s.trim()).filter(Boolean);
const orNull = (v: FormDataEntryValue | null) => String(v ?? '').trim() || null;

export async function saveSettingsAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const m0 = await currentMembership();
  if (!m0) throw new Error('forbidden');
  const m = await requireMember(m0.orgId, 'owner');

  const { data: org, error } = await db.from('orgs').select('settings').eq('id', m.orgId).single();
  if (error) throw error;
  const raw = (org.settings ?? {}) as Record<string, Json>;
  const before = OrgSettings.parse(raw);

  const parsed = OrgSettings.safeParse({
    autosendEnabled: form.get('autosendEnabled') === 'on',
    autosendIntents: AUTOSEND_INTENTS.filter((i) => form.get(`intent_${i}`) === 'on'),
    minSimilarity: Number(form.get('minSimilarity')),
    maxAutoRepliesPerThreadPerDay: Number(form.get('maxAutoRepliesPerThreadPerDay')),
    replyLanguage: form.get('replyLanguage'),
    signature: String(form.get('signature') ?? ''),
    storefrontUrl: orNull(form.get('storefrontUrl')),
    bookingUrl: orNull(form.get('bookingUrl')),
    allowedUrls: lines(form.get('allowedUrls')),
    telegramChatIds: lines(form.get('telegramChatIds')),
    reminderAfterMinutes: Number(form.get('reminderAfterMinutes')),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join('.') || 'settings'}: ${issue?.message ?? 'invalid'}` };
  }
  const next = parsed.data;
  // Turning the master switch on is the riskiest change in the app: require an explicit confirmation.
  if (next.autosendEnabled && !before.autosendEnabled && form.get('confirmAutosend') !== 'on') {
    return { ok: false, error: 'Tick the confirmation box to turn auto-send on.' };
  }

  // Keep keys this form doesn't own (e.g. bridge heartbeat).
  const { error: ue } = await db.from('orgs').update({ settings: { ...raw, ...next } as Json }).eq('id', m.orgId);
  if (ue) throw ue;
  console.info({ msg: 'org_settings_updated', orgId: m.orgId, userId: m.userId, autosendEnabled: next.autosendEnabled, autosendIntents: next.autosendIntents });
  revalidatePath('/settings');
  return { ok: true, message: 'Settings saved.' };
}
