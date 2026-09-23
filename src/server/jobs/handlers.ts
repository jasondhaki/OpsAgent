import 'server-only';
import { z } from 'zod';
import type { Db } from '@/server/db/admin';
import type { Embedder } from '@/server/ai/embed';
import type { Llm } from '@/server/ai/providers';
import type { OrderLookup } from '@/server/adapters/orders/types';
import { embedDocument } from '@/server/kb/ingest';
import { processTicket } from '@/server/pipeline/orchestrator';
import { addEvent } from '@/server/db/repos/tickets';
import { enqueueJob } from './queue';
import type { JobHandlers } from './runner';

const EmbedPayload = z.object({ documentId: z.uuid() });
const TicketPayload = z.object({ ticketId: z.uuid() });

export type HandlerDeps = { db: Db; embedder: Embedder; llm?: Llm; orders?: OrderLookup };

export function jobHandlers(deps: HandlerDeps): JobHandlers {
  const { db, embedder, llm, orders } = deps;
  return {
    embed_document: async (job) => {
      await embedDocument(db, embedder, EmbedPayload.parse(job.payload).documentId);
    },
    process_ticket: async (job) => {
      if (!llm || !orders) throw new Error('process_ticket needs llm + orders deps');
      const { ticketId } = TicketPayload.parse(job.payload);
      try {
        const res = await processTicket({ db, llm, embedder, orders }, ticketId, { deadlineMs: Date.now() + 8_000 });
        if (res.outcome === 'deferred') await enqueueJob(db, { orgId: job.org_id, type: 'process_ticket', payload: { ticketId } });
      } catch (e) {
        // Last attempt: make the failure visible in the queue instead of silently dead-lettering.
        if (job.attempts >= job.max_attempts && job.org_id) {
          await db.from('tickets').update({ status: 'error', requires_human: true }).eq('id', ticketId);
          await addEvent(db, { orgId: job.org_id, ticketId, actor: 'system', type: 'error', data: { message: e instanceof Error ? e.message.slice(0, 300) : 'unknown' } });
        }
        throw e;
      }
    },
  };
}
