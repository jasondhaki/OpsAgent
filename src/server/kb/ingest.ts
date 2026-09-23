import 'server-only';
import type { Db } from '@/server/db/admin';
import type { Embedder } from '@/server/ai/embed';
import { findPlaceholders } from '@/lib/placeholders';
import { chunkMarkdown } from './chunk';

/** Re-chunk and re-embed one KB document, replacing its existing chunks. */
export async function embedDocument(db: Db, embedder: Embedder, documentId: string): Promise<{ chunks: number }> {
  const { data: doc, error } = await db
    .from('kb_documents')
    .select('id, org_id, title, content')
    .eq('id', documentId)
    .single();
  if (error) throw error;

  const left = findPlaceholders(doc.content);
  if (left.length) throw new Error(`document has unfilled placeholders: ${left.join(', ')}`);

  const chunks = chunkMarkdown(doc.content);
  // Title is prepended for embedding only, so short chunks keep their topic.
  const vectors = await embedder.embed(chunks.map((c) => `${doc.title}\n${c}`), 'RETRIEVAL_DOCUMENT');

  // ponytail: delete+insert is not atomic; a failed insert leaves the doc chunkless until the job retries.
  const del = await db.from('kb_chunks').delete().eq('document_id', doc.id);
  if (del.error) throw del.error;
  const ins = await db.from('kb_chunks').insert(
    chunks.map((content, i) => ({
      org_id: doc.org_id,
      document_id: doc.id,
      chunk_index: i,
      content,
      embedding: JSON.stringify(vectors[i]),
      embedding_model: embedder.model,
    })),
  );
  if (ins.error) throw ins.error;
  return { chunks: chunks.length };
}
