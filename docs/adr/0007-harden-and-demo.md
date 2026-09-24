# ADR 0007 — Hardening, public demo, retention

- **Status:** accepted
- **Date:** 2026-09-25

## Context
The app is about to face the internet in two ways: a business inbox in shadow mode, and a
public portfolio demo that anyone can hit without logging in.

## Decision
- **Public `/demo`:**
  - Turnstile, verified server-side and failing closed when unconfigured.
  - Hashed-IP limit of 10 live runs/day plus a global limit of 100/day (`hit_rate_limit`).
  - Always a dry run in the `is_demo` org.
  - The last successful run of each sample is stored in `demo_traces` and replayed when limits,
    the AI quota, or slow models get in the way, so the demo never shows a broken page.
  - Visitor runs (channel `simulator`) are never listed publicly; the inbox shows only the
    fictional seeded tickets (`pnpm demo:seed`).
  - Live runs have a 20 s deadline to stay under serverless request limits (Netlify free: 26 s).
- **Ticket view is one component** (`TicketView`), shared by the dashboard (RLS client) and the
  demo (service client). Every query in it is scoped by `orgId`, which is the only guard when it
  runs with the service client. A test checks that a non-demo ticket id 404s through `/demo`.
- **Retention:** bodies (raw, redacted, headers) of `closed`/`rejected`/`sent` tickets older than
  180 days are blanked by an hourly, batched sweep inside the tick. Metadata and audit events
  stay, so `/insights` keeps working. This treats every finished status as "closed", slightly
  broader than the spec's wording, deliberately, for privacy.
- **Security headers:** HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` and
  `Permissions-Policy` are set in `next.config.ts` (host-agnostic). There's no CSP yet; see the
  threat model.
- **Leads:** a nullable `tickets.lead_status` (`new/contacted/won/lost`); null means new.
- **Insights:** pure `computeInsights()`, unit-tested, over the last 30 days of real-channel tickets.

## Consequences
- The demo's live-run budget is shared by all visitors. A busy day falls back to replays, by design.
- `/insights` aggregates rows in TypeScript (capped). Move to SQL views past a few thousand
  tickets/month.
- Found while taking screenshots: the app had been rendering in a serif fallback font since
  Phase 3 because of a self-referencing `--font-sans` CSS variable. Fixed.
