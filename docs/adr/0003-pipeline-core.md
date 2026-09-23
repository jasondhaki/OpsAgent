# ADR 0003 — Pipeline core

- **Status:** accepted
- **Date:** 2026-09-24

## Context
Phase 2 builds the classify → retrieve → draft → validate → groundedness → gate pipeline on
free-tier models, with the rule that the LLM never decides its own oversight.

## Decision
**Models (env, not code):** primary `gemini-3.5-flash-lite` (newest non-preview Flash-Lite on the
AI Studio key), fallback `openai/gpt-oss-120b` on Groq. Both smoke-tested on 2026-09-24.
Fallback drafts always go to review (`primary_model` check).

**Deterministic layers around the LLM**
- `rules.ts` keyword flags (en + bn + Banglish) are *unioned* with LLM flags. Added
  `other_sensitive` for bulk/custom/quantity/deadline language so rule 5 holds even if the model
  misclassifies a bulk order as a product question.
- `validate.ts`: every number in the draft must appear in context/facts (after Bangla-digit
  normalisation); commitments, non-allowlisted URLs, leaked markers, placeholders, wrong script,
  missing/invalid citations all block auto-send.
- `gate.ts` is a pure function; 11 checks; `wouldAutosend` is always computed (shadow mode).
- Groundedness (second LLM call) runs only when every other check would pass, and is skipped
  (= failed) when a provider has < 50 requests left today.

**Provider layer:** one chain `primary → fallback`, daily caps in `provider_usage`, cooldown from
`retry-after` on 429, one repair retry on schema failure, every attempt logged to `ai_runs` with
`prompt_version`. No SDK retries (`maxRetries: 0`); fallback is the retry.

**Resumability:** classification and drafts are persisted; `drafts.meta` (new column) stores
tier/model/needsHumanBecause so a resumed job can still evaluate the gate without re-drafting.
Redaction, rules, and retrieval are recomputed on resume (cheap / deterministic).

**Order status:** raw order refs come from the redactor (the LLM only sees `[ORDER_REF]`).
Lookups are rate-limited per ref (3/day). A sender that doesn't match the email on file gets no
details. *Deferred:* sending the status to the email on file (needs the outbox, Phase 4).

**Reply language:** `mirror` maps en → English, bn and Banglish → Bangla script (spec §7.6).

## Consequences
- The golden set is labelled by Claude and must be reviewed by Jason (esp. `mustEscalate`).
- Eval runs cost live quota (~2–3 LLM calls + 1 embedding per item); run manually.
- Order-ref format is a fixed default regex (`AB-12345`) until the storefront format is known.
