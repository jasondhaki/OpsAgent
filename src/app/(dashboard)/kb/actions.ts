'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { findPlaceholders } from '@/lib/placeholders';
import { geminiEmbedder } from '@/server/ai/embed';
import { currentMembership, requireMember } from '@/server/auth/requireMember';
import { db } from '@/server/db/admin';
import { enqueueJob } from '@/server/jobs/queue';
import { embedDocument } from '@/server/kb/ingest';

export type KbState = { ok: true; message: string; id?: string } | { ok: false; error: string } | null;

async function owner() {
  const m = await currentMembership();
  if (!m) throw new Error('forbidden');
  return requireMember(m.orgId, 'owner');
}

/** Embed now so retrieval reflects the edit immediately; fall back to the job queue (picked up by the tick in Phase 4). */
async function embedNowOrQueue(orgId: string, documentId: string): Promise<string> {
  try {
    const { chunks } = await embedDocument(db, geminiEmbedder(db), documentId);
    return `embedded (${chunks} chunks)`;
  } catch (e) {
    await enqueueJob(db, { orgId, type: 'embed_document', payload: { documentId } });
    return `embedding queued (${e instanceof Error ? e.message.slice(0, 120) : 'error'})`;
  }
}

const Doc = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['faq', 'policy', 'product', 'care', 'approved_answer']),
  language: z.enum(['bn', 'en', 'mixed']),
  content: z.string().trim().min(1).max(50_000),
  active: z.boolean(),
});

export async function saveDocAction(_: KbState, form: FormData): Promise<KbState> {
  const m = await owner();
  const parsed = Doc.safeParse({
    id: form.get('id') || undefined,
    title: form.get('title'),
    kind: form.get('kind'),
    language: form.get('language'),
    content: form.get('content'),
    active: form.get('active') === 'on',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid document.' };
  const d = parsed.data;
  const left = findPlaceholders(d.content);
  // Rule 1: a document with {{PLACEHOLDERS}} can be saved as a draft but never activated (also a DB constraint).
  if (d.active && left.length) return { ok: false, error: `Fill these before activating: ${left.slice(0, 8).join(', ')}` };

  const row = { title: d.title, kind: d.kind, language: d.language, content: d.content, is_active: d.active, updated_at: new Date().toISOString() };
  let id = d.id;
  if (id) {
    const { data: cur } = await db.from('kb_documents').select('version').eq('id', id).eq('org_id', m.orgId).maybeSingle();
    if (!cur) return { ok: false, error: 'Document not found.' };
    const { error } = await db.from('kb_documents').update({ ...row, version: cur.version + 1 }).eq('id', id).eq('org_id', m.orgId);
    if (error) throw error;
  } else {
    const { data, error } = await db.from('kb_documents').insert({ ...row, org_id: m.orgId, created_by: m.userId }).select('id').single();
    if (error) throw error;
    id = data.id;
  }
  const note = d.active ? await embedNowOrQueue(m.orgId, id) : 'inactive, not used for answers';
  revalidatePath('/kb');
  return { ok: true, message: `Saved — ${note}.`, id };
}

export async function reembedAction(_: KbState, form: FormData): Promise<KbState> {
  const m = await owner();
  const id = z.uuid().parse(form.get('id'));
  const { data: doc } = await db.from('kb_documents').select('is_active').eq('id', id).eq('org_id', m.orgId).maybeSingle();
  if (!doc?.is_active) return { ok: false, error: 'Only active documents are embedded.' };
  const note = await embedNowOrQueue(m.orgId, id);
  revalidatePath('/kb');
  return { ok: true, message: `Re-embed: ${note}.` };
}
