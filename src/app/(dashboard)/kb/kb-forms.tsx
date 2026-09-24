'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitKeepingValues } from '@/lib/form';
import { findPlaceholders } from '@/lib/placeholders';
import { reembedAction, saveDocAction, type KbState } from './actions';

function useToast(state: KbState, onOk?: (s: Extract<KbState, { ok: true }>) => void) {
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      onOk?.(state);
    } else toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per result
  }, [state]);
}

type Doc = { id: string; title: string; kind: string; language: string; content: string; is_active: boolean } | null;

export function DocEditor({ doc }: { doc: Doc }) {
  const router = useRouter();
  const [state, save, pending] = useActionState(saveDocAction, null);
  const [content, setContent] = useState(doc?.content ?? '');
  useToast(state, (s) => !doc && s.id && router.replace(`/kb?doc=${s.id}`));
  const left = findPlaceholders(content);

  return (
    <form onSubmit={submitKeepingValues(save)} className="space-y-3 rounded-xl border p-4">
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-3">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={doc?.title} required maxLength={200} />
        </div>
        <Picker name="kind" label="Kind" value={doc?.kind ?? 'faq'} options={['faq', 'policy', 'product', 'care', 'approved_answer']} />
        <Picker name="language" label="Language" value={doc?.language ?? 'en'} options={['en', 'bn', 'mixed']} />
        <label className="flex items-center gap-2 self-end pb-1 text-sm">
          <input type="checkbox" name="active" defaultChecked={doc?.is_active ?? false} className="size-4" />
          Active (used for answers)
        </label>
      </div>
      <div className="space-y-1">
        <Label htmlFor="content">Content (markdown)</Label>
        <Textarea id="content" name="content" value={content} onChange={(e) => setContent(e.target.value)} className="min-h-72 font-mono text-xs" required />
      </div>
      <p className={left.length ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'} aria-live="polite">
        {left.length ? `${left.length} placeholder(s) left — cannot activate: ${left.slice(0, 6).join(', ')}${left.length > 6 ? ', …' : ''}` : 'No placeholders left.'}
      </p>
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
    </form>
  );
}

export function ReembedButton({ id }: { id: string }) {
  const [state, run, pending] = useActionState(reembedAction, null);
  useToast(state);
  return (
    <form action={run}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="xs" disabled={pending}>{pending ? 'Embedding…' : 'Re-embed'}</Button>
    </form>
  );
}

function Picker({ name, label, value, options }: { name: string; label: string; value: string; options: string[] }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <select id={name} name={name} defaultValue={value} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
        {options.map((o) => <option key={o} value={o}>{o.replaceAll('_', ' ')}</option>)}
      </select>
    </div>
  );
}
