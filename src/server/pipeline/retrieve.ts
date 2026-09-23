import 'server-only';
import type { Db } from '@/server/db/admin';
import type { Embedder } from '@/server/ai/embed';

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  title: string;
  kind: string;
  content: string;
  similarity: number;
};

export async function searchKb(db: Db, embedder: Embedder, orgId: string, query: string, count = 6): Promise<RetrievedChunk[]> {
  const [vector] = await embedder.embed([query], 'RETRIEVAL_QUERY');
  const { data, error } = await db.rpc('match_kb_chunks', {
    p_org_id: orgId,
    p_query: JSON.stringify(vector),
    p_match_count: count,
  });
  if (error) throw error;
  return data.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    title: r.title,
    kind: r.kind,
    content: r.content,
    similarity: r.similarity,
  }));
}
