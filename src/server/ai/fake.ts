import 'server-only';
import type { Embedder } from './embed';
import type { Llm, LlmResult, StructuredCall, Tier } from './providers';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Deterministic, offline embedder for tests and local smoke runs: hashed bag of words,
 * L2-normalised. Captures keyword overlap only — no semantics, no cross-language matching.
 */
export function fakeEmbedder(dim = 768): Embedder {
  return {
    model: 'fake-bow',
    async embed(texts) {
      return texts.map((t) => {
        const v = new Array<number>(dim).fill(0);
        for (const tok of t.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []) v[fnv1a(tok) % dim] += 1;
        const norm = Math.hypot(...v) || 1;
        return v.map((x) => x / norm);
      });
    },
  };
}

/**
 * Deterministic LLM for tests. `respond` returns the raw object for a call (validated against the
 * call's schema like a real model output), or throws to simulate provider failure.
 */
export function fakeLlm(respond: (call: StructuredCall<unknown>) => unknown, tier: Tier = 'primary'): Llm {
  return {
    async structured<T>(call: StructuredCall<T>): Promise<LlmResult<T>> {
      try {
        const parsed = call.schema.safeParse(respond(call as StructuredCall<unknown>));
        if (!parsed.success) return { ok: false, error: `fake: schema mismatch for ${call.step}` };
        return { ok: true, value: parsed.data, tier, provider: 'fake', model: 'fake' };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
