# OpsAgent

An AI operations & support agent for a small business inbox. It classifies inbound email
(English, Bangla, Banglish), drafts grounded replies from a knowledge base, and a
**deterministic gate** decides whether a human must approve. Auto-send is off by default and
must be earned per intent with measured evidence.

First tenant: *Jhunu's Crafts*, a handmade jute & leather bag business in Bangladesh.
Budget: $0 (free tiers only).

## Progress

- [x] Phase 0: foundation (Next.js, Supabase schema + RLS, CI)
- [ ] Phase 1: knowledge base
- [ ] Phase 2: pipeline core + evals
- [ ] Phase 3: dashboard
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
