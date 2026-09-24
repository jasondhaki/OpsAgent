'use client';

import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { OrgSettings } from '@/lib/contracts';
import { humanize } from '@/lib/format';
import { saveSettingsAction } from './actions';

export type IntentStats = { intent: string; approved: number; unedited: number };

export function SettingsForm({ settings, stats, canEdit }: { settings: OrgSettings; stats: IntentStats[]; canEdit: boolean }) {
  const [state, save, pending] = useActionState(saveSettingsAction, null);
  const [autosend, setAutosend] = useState(settings.autosendEnabled);
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.error);
  }, [state]);

  return (
    <form action={save} className="space-y-6">
      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">Auto-send</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autosendEnabled" checked={autosend} onChange={(e) => setAutosend(e.target.checked)} className="size-4" />
            <span>Master switch: let the gate send replies without review</span>
          </label>
          {autosend && !settings.autosendEnabled && (
            <label className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
              <input type="checkbox" name="confirmAutosend" className="mt-0.5 size-4" />
              <span>I have reviewed the shadow-mode evidence below. Replies that pass every gate check will go to customers without anyone reading them first.</span>
            </label>
          )}
          <p className="text-sm text-muted-foreground">Only these intents may ever auto-send. Approve-without-edit rate is the evidence to look at:</p>
          <ul className="space-y-2">
            {stats.map((s) => (
              <li key={s.intent}>
                <label className="flex flex-wrap items-center gap-2">
                  <input type="checkbox" name={`intent_${s.intent}`} defaultChecked={settings.autosendIntents.includes(s.intent as never)} className="size-4" />
                  <span>{humanize(s.intent)}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.approved ? `${Math.round((100 * s.unedited) / s.approved)}% approved without edits (${s.unedited}/${s.approved})` : 'no approvals yet'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Thresholds & replies</h2>
          <Field label="Min. retrieval similarity (0–1)" name="minSimilarity" type="number" step="0.01" min="0" max="1" defaultValue={settings.minSimilarity} hint="Calibrate with pnpm eval (ADR 0004)." />
          <Field label="Max auto-replies per thread per day" name="maxAutoRepliesPerThreadPerDay" type="number" min="0" defaultValue={settings.maxAutoRepliesPerThreadPerDay} />
          <Field label="Remind reviewers after (minutes)" name="reminderAfterMinutes" type="number" min="1" defaultValue={settings.reminderAfterMinutes} />
          <div className="space-y-1">
            <Label htmlFor="replyLanguage">Reply language</Label>
            <select id="replyLanguage" name="replyLanguage" defaultValue={settings.replyLanguage} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
              <option value="mirror">Mirror the customer</option>
              <option value="bn">Always Bangla</option>
              <option value="en">Always English</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="signature">Signature</Label>
            <Textarea id="signature" name="signature" defaultValue={settings.signature} maxLength={300} />
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Links & notifications</h2>
          <Field label="Storefront URL" name="storefrontUrl" type="url" defaultValue={settings.storefrontUrl ?? ''} />
          <Field label="Booking URL (optional)" name="bookingUrl" type="url" defaultValue={settings.bookingUrl ?? ''} />
          <div className="space-y-1">
            <Label htmlFor="allowedUrls">Other allowed URLs in replies (one per line)</Label>
            <Textarea id="allowedUrls" name="allowedUrls" defaultValue={settings.allowedUrls.join('\n')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="telegramChatIds">Telegram chat IDs (one per line)</Label>
            <Textarea id="telegramChatIds" name="telegramChatIds" defaultValue={settings.telegramChatIds.join('\n')} />
            <p className="text-xs text-muted-foreground">Send /start to the bot to get your chat ID (Phase 4).</p>
          </div>
        </section>
      </fieldset>
      {canEdit ? <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</Button> : <p className="text-sm text-muted-foreground">Only the owner can change settings.</p>}
    </form>
  );
}

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.ComponentProps<typeof Input> & { name: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
