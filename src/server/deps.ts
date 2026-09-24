import 'server-only';
import { db } from '@/server/db/admin';
import { createLlm } from '@/server/ai/providers';
import { geminiEmbedder } from '@/server/ai/embed';
import { mockOrders } from '@/server/adapters/orders/mock';
import type { PipelineDeps } from '@/server/pipeline/orchestrator';

// ponytail: ORDER_ADAPTER=http (storefrontHttp.ts) is not built yet; mock is the only adapter.
export const pipelineDeps = (): PipelineDeps => ({ db, llm: createLlm(db), embedder: geminiEmbedder(db), orders: mockOrders });
