import 'server-only';
import type { Embedder } from './embed';

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
