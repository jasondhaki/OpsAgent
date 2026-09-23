# ADR 0002 — Knowledge base ingestion and retrieval

- **Status:** accepted
- **Date:** 2026-09-24

## Context
Phase 1 needs KB templates that never contain guessed business facts, a chunker, embeddings,
and a way to prove retrieval works in English, Bangla and Banglish on the free tier.

## Decision
- **Placeholder guard lives in the database**: check constraint
  `kb_documents_no_placeholders_when_active`. No code path (script, UI, future bug) can activate
  a document with `{{…}}` left. `findPlaceholders()` mirrors the regex for UI/CLI feedback.
- **Chunker**: heading-aware; each chunk starts with its heading breadcrumb; whole sections are
  packed greedily to ~1,800 chars; only a single oversized section is window-split (200 overlap).
  The document title is prepended at embed time only.
- **Embeddings**: `gemini-embedding-001` via AI SDK, 768 dims, `RETRIEVAL_DOCUMENT` /
  `RETRIEVAL_QUERY`, one batch call per document, `maxParallelCalls: 1` for free-tier RPM.
  Model name is stored per chunk.
- **Offline fake embedder** (hashed bag of words) for tests and `--fake` smoke runs. It proves
  plumbing only; it has no semantics or cross-script matching.
- **"Also asked as" lines** in KB docs carry real Bangla/Banglish phrasings to help retrieval.
  They must not copy eval/check questions verbatim.
- **`/kb` page deferred to Phase 3** so it ships behind Google login + `requireMember`. Until
  then the KB is managed with `pnpm kb load|query|check`.

## Consequences
- Phase 1 "done" (10 sample questions retrieve the right chunk) must be confirmed with a real
  Gemini key: `pnpm kb load demo kb-seed/demo && pnpm kb check`.
- Chunk replacement is delete-then-insert (not atomic); a failed job leaves a document without
  chunks until it retries. Acceptable at this scale.
- Embedding calls are not yet counted in `provider_usage` / `ai_runs`; that arrives with
  `providers.ts` + `budget.ts` in Phase 2.

## Result (2026-09-24)
`pnpm kb check` with `gemini-embedding-001` @ 768d: **hit@1 10/10** (5 en, 3 bn, 2 Banglish).
Top-1 similarities ranged **0.67–0.75**, i.e. mostly *below* the default `minSimilarity` 0.75.
The gate threshold must be calibrated with the Phase 2 eval set, not left at the default.
