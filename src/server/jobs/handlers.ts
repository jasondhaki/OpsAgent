import 'server-only';
import { z } from 'zod';
import type { Db } from '@/server/db/admin';
import type { Embedder } from '@/server/ai/embed';
import { embedDocument } from '@/server/kb/ingest';
import type { JobHandlers } from './runner';

const EmbedPayload = z.object({ documentId: z.uuid() });

export function jobHandlers(db: Db, embedder: Embedder): JobHandlers {
  return {
    embed_document: async (job) => {
      await embedDocument(db, embedder, EmbedPayload.parse(job.payload).documentId);
    },
  };
}
