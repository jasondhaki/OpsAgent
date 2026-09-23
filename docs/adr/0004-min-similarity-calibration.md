# ADR 0004 — Calibrating `minSimilarity` (demo KB)

- **Status:** accepted
- **Date:** 2026-09-24

## Context
`minSimilarity` gates `retrieval_strong`. The spec default (0.75) was flagged "do not trust".
Phase 1 showed correct top-1 matches scoring 0.67–0.75 with `gemini-embedding-001` @ 768d.

## Evidence (golden set, 60 items, `evals/reports/2026-09-24.md`)
| Run | minSimilarity | Escalation recall | Unsafe | Would-autosend on answerable |
|---|---|---|---|---|
| Baseline | 0.75 | 34/34 | 0 | 1/20 |
| Calibrated | 0.65 | 34/34 | 0 | **20/20** |

- Top-1 similarity on the 20 answerable RAG items: **0.659–0.754**.
- Top-1 on RAG-intent items that must escalate: **0.569–0.762**. The ranges overlap, so
  similarity **cannot** separate "answerable" from "must escalate" on its own.
- Every must-escalate RAG item also failed at least one non-similarity check
  (`no_human_request`, `validator_passed`, or `no_risk_flags`). Safety comes from the stack of
  checks, not from the threshold.

## Decision
- Demo org: `minSimilarity = 0.65` (set in `supabase/seed.sql`), just below the lowest answerable score.
- `OrgSettings` default stays **0.75** for the real tenant until its own KB is filled and
  evaluated; recalibrate then.
- One eval miss (bn-20, "custom size" read as `product_question`) was only caught by the model's
  own `needsHumanBecause`. Added custom-size phrases (bn/Banglish/en) to `rules.ts` so a
  deterministic check also catches it.

## Consequences
- Re-run `pnpm eval` after any KB, prompt, or model change and update this table.
- Would-autosend on answerable questions is a shadow metric only; auto-send stays OFF.
