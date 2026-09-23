# ADR 0001 — v2 reset (Phase 0 audit)

- **Status:** accepted
- **Date:** 2026-09-24

## Context
CLAUDE.md §12 Phase 0 requires auditing any v1 code (OpenAI + Resend + Cal.com + Vercel) before
rewriting. The repo at audit time contained only `CLAUDE.md` and `OpsAgent_v2_Blueprint.pdf`;
the GitHub remote (`jasondhaki/OpsAgent`) was empty.

## Decision
| Item | Verdict |
|---|---|
| v1 application code | **None present** — nothing to keep, migrate, or delete. |
| `CLAUDE.md` | Keep — source of truth. |
| `OpsAgent_v2_Blueprint.pdf` | Keep locally, **git-ignored** (private planning doc). |

Fresh v2 foundation:
- Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind 4, shadcn/ui, pnpm, ESLint, Vitest.
- Supabase CLI as a dev dependency (no global install needed): `pnpm exec supabase …`.
- Migrations for all of §5, split into four files (enums, core, kb/jobs/telemetry, security).
- Zod 4. Contracts build enums from generated `Constants` (rule 11); CI fails if generated
  types drift from SQL.

Small, deliberate deviations from the §5 SQL text (all more conservative or Supabase-required):
- `vector`/`citext` installed in the `extensions` schema (Supabase convention); column types
  are schema-qualified.
- Functions get `set search_path`; `claim_jobs` also has `execute` revoked from
  `public, anon, authenticated` (the spec only revoked it on the other service functions).
- `outbox_no_demo` fires on `insert or update`, so a row can't be moved to the demo org later.
- `org_members` gets one policy: a user may read **their own** memberships (needed for
  `requireMember` with the user-scoped client). Still no write policies.
- `is_org_member` execute is revoked from `anon`.

## Consequences
- `tests/db/security.test.ts` requires a local DB (`pnpm exec supabase start`); CI runs
  `supabase db start`.
- Env vars for later phases are optional in `env.ts` until their phase lands; tighten then.
