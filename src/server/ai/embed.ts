import 'server-only';
import { embedMany } from 'ai';
import { google, type GoogleEmbeddingModelOptions } from '@ai-sdk/google';
import { env } from '@/server/env';

export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export interface Embedder {
  model: string;
  embed(texts: string[], task: EmbedTask): Promise<number[][]>;
}

// ponytail: no ai_runs logging / daily budget yet; lands with providers.ts + budget.ts in Phase 2.
export function geminiEmbedder(): Embedder {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
  const model = env.EMBEDDING_MODEL;
  return {
    model,
    async embed(texts, task) {
      const { embeddings } = await embedMany({
        model: google.embedding(model),
        values: texts,
        maxParallelCalls: 1, // free tier has low RPM
        providerOptions: {
          google: { outputDimensionality: env.EMBEDDING_DIM, taskType: task } satisfies GoogleEmbeddingModelOptions,
        },
      });
      return embeddings;
    },
  };
}
