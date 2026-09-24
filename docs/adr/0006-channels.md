# ADR 0006 — Gmail bridge, outbox, Telegram

- **Status:** accepted
- **Date:** 2026-09-24

## Context
We need email in and out with no domain and no paid service, and reviewer alerts on a phone.
The failure that would hurt most is sending a customer the same reply twice, or replying to an
auto-responder and starting a mail loop.

## Decision
- **Gmail + Apps Script bridge** (`bridge/apps-script/Code.gs`) running as the business Gmail.
  Every call is `POST` with HMAC over `${ts}.${rawBody}` (±300 s, `timingSafeEqual`, 100 KB cap).
  The script signs and sends the same UTF-8 bytes, so Bangla text verifies.
- **Exactly-once sending:** `claim_outbox()` leases rows atomically (`for update skip locked`).
  The script writes a `sent_<id>` marker *before* acking, and on a re-claim it only re-acks.
  Acks are idempotent server-side. Expired leases are re-offered up to 3 attempts, then the row
  fails and the ticket shows as `error`. Only `queued` rows are claimable, so `cancelled`
  (simulator) rows can never be sent. A rolling 24 h cap (`OUTBOUND_DAILY_CAP` = 80) stays under
  Gmail's consumer quota.
- **Loop protection at ingest:** `Auto-Submitted`, `Precedence: bulk|junk|list`, `List-Id`,
  `X-Autoreply`, bounce/no-reply senders, and our own address (`X-OpsAgent-Account`, set by the
  bridge) are stored as closed tickets with no job. An auto-reply gets its **own** ticket, so an
  out-of-office landing in a live thread can't reset or close the customer's real ticket.
- **Scheduler:** the bridge calls `/api/bridge/tick` every 5 min, and GitHub Actions calls it
  every 15 min as backup (`CRON_SECRET`). Tick = heartbeat (`bridge_heartbeats`, its own table so
  it never races settings saves) + reap dead leases + reminder + jobs for about 8 s.
- **Telegram:** plain-text messages (no `parse_mode`, so customer text can't inject markup) with
  the *redacted* snippet. Approve/Reject call the same `review.ts` as the dashboard, with
  actor `telegram:<chatId>`, allow-listed chat IDs only, webhook verified by
  `X-Telegram-Bot-Api-Secret-Token`. The pipeline notifies only on real runs, never dry runs,
  and a notify failure never fails the pipeline.
- **One tenant per bridge secret** (`DEFAULT_ORG_SLUG`) for now.

## Consequences
- Verified locally by running the real `Code.gs` under stubbed Apps Script services: Bangla
  ingest → pipeline → approve → in-thread send, and a crash between send and ack still produced
  exactly one email. A real Gmail + Telegram run needs a public URL (see SETUP.md).
- Not built yet: the order-status email to the address on file when the sender doesn't match
  (the pipeline still safely refuses to disclose), the email-digest fallback notifier, and
  per-org bridge secrets.
