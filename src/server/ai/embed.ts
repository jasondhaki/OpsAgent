import 'server-only';
import { APICallError, embedMany } from 'ai';
import { google, type GoogleEmbeddingModelOptions } from '@ai-sdk/google';
import type { Db } from '@/server/db/admin';
import { env } from '@/server/env';
import { hasBudget, recordRequest, setCooldown } from './budget';

export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export interface Embedder {
  model: string;
  embed(texts: string[], task: EmbedTask): Promise<number[][]>;
}

/** Gemini embeddings, counted against DAILY_CAP_GOOGLE and logged to ai_runs (step 'embed'). Throws on failure; job retries handle it. */
export function geminiEmbedder(db: Db): Embedder {
  const model = env.EMBEDDING_MODEL;
  const log = (ok: boolean, error: string | null, latencyMs: number, inputTokens?: number) =>
    db.from('ai_runs').insert({
      step: 'embed',
      provider: 'google',
      model,
      ok,
      error,
      latency_ms: latencyMs,
      input_tokens: inputTokens ?? null,
    });
  return {
    model,
    async embed(texts, task) {
      if (!env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
      if (!(await hasBudget(db, 'google', model, env.DAILY_CAP_GOOGLE))) throw new Error(`google ${model}: no embedding budget`);
      // ponytail: counts one request per embed() call; embedMany may split very large batches into several API calls.
      await recordRequest(db, 'google', model);
      const started = Date.now();
      try {
        const { embeddings, usage } = await embedMany({
          model: google.embedding(model),
          values: texts,
          maxParallelCalls: 1, // free tier has low RPM
          maxRetries: 0, // job retries are our retry
          providerOptions: {
            google: { outputDimensionality: env.EMBEDDING_DIM, taskType: task } satisfies GoogleEmbeddingModelOptions,
          },
        });
        await log(true, null, Date.now() - started, usage?.tokens);
        return embeddings;
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 300) : String(e);
        await log(false, msg, Date.now() - started);
        if (APICallError.isInstance(e) && e.statusCode === 429) {
          const retryAfter = Number(e.responseHeaders?.['retry-after']);
          await setCooldown(db, 'google', model, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60);
        }
        throw e;
      }
    },
  };
}
