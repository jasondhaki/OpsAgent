# ADR 0005 — Dashboard: auth, reads, review actions

- **Status:** accepted
- **Date:** 2026-09-24

## Context
Phase 3 adds the human side of the gate: a reviewer must be able to see a ticket, understand
why the gate held it, and approve, edit, reject, or regenerate the reply, from a phone.
Telegram approvals (Phase 4) have to go through exactly the same logic.

## Decision
- **Auth:** Supabase Google OAuth. `src/proxy.ts` only refreshes the session cookie and bounces
  signed-out visitors to `/login`. Authorization happens on every page (`requirePageMember`)
  and every Server Action (`requireMember(orgId, role)`), because layouts do not protect pages.
  The org is the user's `DEFAULT_ORG_SLUG` membership, falling back to their first one. There is
  no org switcher yet.
- **Reads** use the signed-in user's Supabase client, so RLS (`member_read`) enforces
  "non-members see nothing". **Writes** use the service-role client inside Server Actions, after
  `requireMember`, and always write a `ticket_events` row with `actor = user:<id>`.
- **One review module** (`src/server/review.ts`) serves the dashboard now and Telegram later.
  Approve first claims the ticket with `update … where status = 'needs_review'`, so a double tap
  or dashboard + Telegram cannot both create an outbox row.
- **Simulator tickets:** approving one writes an outbox row with status `cancelled` instead of
  `queued`. The audit trail is complete, but the Gmail bridge can never send a pretend message.
  The demo org gets no outbox row at all (DB trigger, rule 7).
- **Regenerate** accepts a reviewer instruction (trusted). It goes into the draft prompt only when
  given, so the prompt without an instruction is byte-identical to the evaluated `draft.v1`.
  Regenerated drafts always go back to review and are never auto-sent.
- **Save as approved answer** is owner-only and manual. It stores the *redacted* question, never
  raw PII.

## Consequences
- Approved answers and failed KB embeds are queued as `embed_document` jobs. Nothing runs jobs
  until the Phase 4 tick, so until then the KB page embeds inline and queues only on failure.
- Settings changes are logged to the server console, not to an audit table
  (`ticket_events` is per ticket). Add an `org_events` table if that matters.
- Only one org per user is shown. Add a switcher if Jason needs to work in both the demo and
  the real org.
