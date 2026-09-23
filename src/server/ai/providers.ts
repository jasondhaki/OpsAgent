import 'server-only';
import { APICallError, generateText, NoObjectGeneratedError, Output, type LanguageModel } from 'ai';
import { google } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';
import type { z } from 'zod';
import type { Db } from '@/server/db/admin';
import { env } from '@/server/env';
import { hasBudget, recordRequest, setCooldown } from './budget';

export type Tier = 'primary' | 'fallback';

export type StructuredCall<T> = {
  step: 'classify' | 'draft' | 'groundedness';
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  promptVersion: string;
  orgId?: string | null;
  ticketId?: string | null;
  /** Skip providers with less than this many requests left today (e.g. optional groundedness). */
  minRemaining?: number;
};

export type LlmResult<T> =
  | { ok: true; value: T; tier: Tier; provider: string; model: string }
  | { ok: false; error: string };

export interface Llm {
  structured<T>(call: StructuredCall<T>): Promise<LlmResult<T>>;
}

type ProviderSpec = { tier: Tier; provider: string; model: string; cap: number; lm: () => LanguageModel };

function providerChain(): ProviderSpec[] {
  const chain: ProviderSpec[] = [];
  if (env.GOOGLE_GENERATIVE_AI_API_KEY && env.MODEL_PRIMARY) {
    const model = env.MODEL_PRIMARY;
    chain.push({ tier: 'primary', provider: 'google', model, cap: env.DAILY_CAP_GOOGLE, lm: () => google(model) });
  }
  if (env.GROQ_API_KEY && env.MODEL_FALLBACK) {
    const model = env.MODEL_FALLBACK;
    chain.push({ tier: 'fallback', provider: 'groq', model, cap: env.DAILY_CAP_GROQ, lm: () => groq(model) });
  }
  return chain;
}

const REPAIR_NOTE = '\n\nYour previous answer did not match the required JSON schema. Return only valid JSON that matches it exactly.';

/** Real provider chain: primary → fallback, with daily caps, 429 cooldowns, one repair retry, and ai_runs logging. */
export function createLlm(db: Db): Llm {
  return {
    async structured<T>(call: StructuredCall<T>): Promise<LlmResult<T>> {
      const errors: string[] = [];
      for (const p of providerChain()) {
        if (!(await hasBudget(db, p.provider, p.model, p.cap - (call.minRemaining ?? 0)))) {
          errors.push(`${p.provider}: no budget`);
          continue;
        }
        for (let attempt = 0; attempt < 2; attempt++) {
          const started = Date.now();
          await recordRequest(db, p.provider, p.model);
          try {
            const res = await generateText({
              model: p.lm(),
              system: call.system,
              prompt: attempt === 0 ? call.prompt : call.prompt + REPAIR_NOTE,
              output: Output.object({ schema: call.schema }),
              temperature: 0,
              maxRetries: 0, // fallback is our retry
            });
            await logRun(db, call, p, true, null, Date.now() - started, res.usage.inputTokens, res.usage.outputTokens);
            return { ok: true, value: res.output as T, tier: p.tier, provider: p.provider, model: p.model };
          } catch (e) {
            const msg = e instanceof Error ? e.message.slice(0, 300) : String(e);
            await logRun(db, call, p, false, msg, Date.now() - started);
            errors.push(`${p.provider}: ${msg}`);
            if (NoObjectGeneratedError.isInstance(e) && attempt === 0) continue; // one repair retry
            if (APICallError.isInstance(e) && e.statusCode === 429) {
              const retryAfter = Number(e.responseHeaders?.['retry-after']);
              await setCooldown(db, p.provider, p.model, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60);
            }
            break; // next provider
          }
        }
      }
      return { ok: false, error: errors.join(' | ') || 'no provider configured' };
    },
  };
}

async function logRun(
  db: Db,
  call: StructuredCall<unknown>,
  p: ProviderSpec,
  ok: boolean,
  error: string | null,
  latencyMs: number,
  inputTokens?: number,
  outputTokens?: number,
) {
  await db.from('ai_runs').insert({
    org_id: call.orgId ?? null,
    ticket_id: call.ticketId ?? null,
    step: call.step,
    provider: p.provider,
    model: p.model,
    prompt_version: call.promptVersion,
    ok,
    error,
    latency_ms: latencyMs,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
  });
}
