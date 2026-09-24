# OpsAgent

An AI operations & support agent for a small business inbox. It classifies inbound email
(English, Bangla, Banglish), drafts grounded replies from a knowledge base, and a
**deterministic gate** decides whether a human must approve. Auto-send is off by default and
must be earned per intent with measured evidence.

First tenant: *Jhunu's Crafts*, a handmade jute & leather bag business in Bangladesh.
Budget: $0 (free tiers only).

## Progress

- [x] Phase 0: foundation (Next.js, Supabase schema + RLS, CI)
- [x] Phase 1: knowledge base (CLI; `/kb` UI ships with Phase 3 auth)
- [x] Phase 2: pipeline core + evals (latest: [evals/reports/2026-09-24.md](evals/reports/2026-09-24.md))
- [x] Phase 3: dashboard (Google login, queue, ticket review with gate checklist, simulator, settings, KB). Browser smoke tests: `pnpm e2e` (add `E2E_REAL_LLM=1` to include a real simulator run)
- [ ] Phase 4: Gmail bridge + Telegram
- [ ] Phase 5: harden & launch (shadow mode)

## Local development

Requires Node 24, pnpm, and Docker.

```sh
pnpm i
pnpm exec supabase start      # prints local URL + keys
cp .env.example .env.local    # fill NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
pnpm dev
```

Checks: `pnpm typecheck && pnpm lint && pnpm test` (DB tests need the local Supabase running).
After changing SQL: `pnpm exec supabase migration new <name>`, then `pnpm db:types`.

Design decisions live in [`docs/adr/`](docs/adr).

## Dashboard login (local)

Admin login is Google OAuth plus the `org_members` allowlist.
1. In Google Cloud, create an OAuth client (Web). Authorised redirect URI: `http://127.0.0.1:54321/auth/v1/callback`.
2. Export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in your shell, then `pnpm exec supabase start`.
3. Sign in once at `/login` (you will see "No access"), then add yourself:
   `insert into org_members (org_id, user_id, role) select o.id, u.id, 'owner' from orgs o, auth.users u where o.slug = 'jhunus-crafts' and u.email = '<you>';`

Simulator tickets land in the queue like real ones; approving one records an outbox row with
status `cancelled`, so nothing from the simulator can ever be sent.

## Knowledge base

```sh
pnpm kb load demo kb-seed/demo          # fictional demo KB
pnpm kb load jhunus-crafts kb-seed      # real templates; stay inactive until placeholders are filled
pnpm kb check                           # 10-question retrieval check (needs GOOGLE_GENERATIVE_AI_API_KEY)
pnpm kb query demo "delivery outside Dhaka?"
```
Add `--fake` to any command to run offline with the keyword embedder.

## Evaluation

`pnpm eval` runs the real pipeline (dry run) on 60 labelled messages (20 English, 20 Bangla,
20 Banglish, 16 adversarial: prompt injection, price bait, spoofed order lookups, hostile
complaints, hidden date commitments) and writes `evals/reports/<date>.md`.

Latest (2026-09-24, `gemini-3.5-flash-lite`): **escalation recall 34/34 (100%) · unsafe
would-autosends 0 · intent accuracy 57/60 · answerable questions that would auto-send 20/20**.
Auto-send stays off; these are shadow-mode numbers.
