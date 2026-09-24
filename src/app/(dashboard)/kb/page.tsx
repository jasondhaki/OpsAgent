import Link from 'next/link';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { findPlaceholders } from '@/lib/placeholders';
import { geminiEmbedder } from '@/server/ai/embed';
import { hasRole, requirePageMember } from '@/server/auth/requireMember';
import { db } from '@/server/db/admin';
import { userDb } from '@/server/db/user';
import { searchKb, type RetrievedChunk } from '@/server/pipeline/retrieve';
import { DocEditor, ReembedButton } from './kb-forms';

export default async function KbPage({ searchParams }: PageProps<'/kb'>) {
  const m = await requirePageMember();
  const isOwner = hasRole(m.role, 'owner');
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 500) : '';
  const docParam = typeof sp.doc === 'string' ? sp.doc : null;
  const sb = await userDb();

  const { data: docs, error } = await sb
    .from('kb_documents')
    .select('id, title, kind, language, content, is_active, version, updated_at, chunks:kb_chunks(count)')
    .eq('org_id', m.orgId)
    .order('title');
  if (error) throw error;
  const editing = docParam && z.uuid().safeParse(docParam).success ? (docs.find((d) => d.id === docParam) ?? null) : null;

  // "Test retrieval": the same search the pipeline runs (embeds the query; uses quota).
  let hits: RetrievedChunk[] = [];
  let searchError: string | null = null;
  if (q) {
    try {
      hits = await searchKb(db, geminiEmbedder(db), m.orgId, q, 5);
    } catch (e) {
      searchError = e instanceof Error ? e.message : 'search failed';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Knowledge base</h1>
        {isOwner && <Link href="/kb?doc=new" className="text-sm underline">New document</Link>}
      </div>

      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="font-semibold">Test retrieval</h2>
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Ask like a customer, e.g. ঢাকার বাইরে ডেলিভারি চার্জ কত?" aria-label="Test question" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        {searchError && <p role="alert" className="text-sm text-destructive">{searchError}</p>}
        {q && !searchError && !hits.length && <p className="text-sm text-muted-foreground">No chunks found — is anything active and embedded?</p>}
        <ol className="space-y-2">
          {hits.map((h) => (
            <li key={h.chunkId} className="rounded-lg border p-2 text-sm">
              <p><strong>{h.similarity.toFixed(3)}</strong> · {h.title} <span className="text-muted-foreground">({h.kind})</span></p>
              <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{h.content}</p>
            </li>
          ))}
        </ol>
      </section>

      {isOwner && (docParam === 'new' || editing) && <DocEditor key={editing?.id ?? 'new'} doc={editing} />}

      {!docs.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No documents yet. Load the templates with <code>pnpm kb load</code> or create one.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const left = findPlaceholders(d.content).length;
            const chunks = d.chunks[0]?.count ?? 0;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                <Link href={`/kb?doc=${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                <Badge variant="secondary">{d.kind.replaceAll('_', ' ')}</Badge>
                <Badge variant="outline">{d.language}</Badge>
                {d.is_active ? <Badge variant="outline">active · {chunks} chunks</Badge> : <Badge variant="destructive">inactive</Badge>}
                {left > 0 && <Badge variant="destructive">{left} placeholders</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">v{d.version}</span>
                {isOwner && d.is_active && <ReembedButton id={d.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
