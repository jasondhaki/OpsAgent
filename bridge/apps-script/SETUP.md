# Gmail bridge + Telegram: setup

The bridge is a small Google Apps Script that runs **inside the Gmail account** and talks to
OpsAgent over signed HTTPS. No domain, no paid email service. Test it with a **throwaway test
Gmail first**, and only then install it in the business Gmail.

> ⚠️ **The script reads the whole inbox of the account it runs in.** On its first run it ingests
> the last 2 days of mail. Never install it in a personal account: use a brand-new test Gmail
> for testing, and only the business Gmail for production.

## 0. You need a public URL

Apps Script runs on Google's servers, so it can't reach `localhost`.
- **Local testing:** a free Cloudflare quick tunnel (no account needed):
  `cloudflared tunnel --url http://localhost:3000` prints `https://<random>.trycloudflare.com`.
  The URL changes every time you restart the tunnel.
- **Production:** the Netlify URL (Phase 5).

Set `APP_BASE_URL` in `.env.local` to that URL (Telegram's "Open" button needs https), then restart `pnpm dev`.

## 1. Secrets

`BRIDGE_HMAC_SECRET`, `CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET` must be ≥ 32 random bytes.
Generate each with:
```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
The same `BRIDGE_HMAC_SECRET` goes in `.env.local` (server) **and** in the script's properties (step 2).

## 2. Install the script (in the Gmail account that receives customer mail)

1. Signed in as that Gmail, open https://script.google.com → **New project**. Name it `OpsAgent bridge`.
2. **Project Settings** (gear) → tick **Show "appsscript.json" manifest file**.
3. Replace the editor's `Code.gs` with `bridge/apps-script/Code.gs`, and `appsscript.json` with ours.
4. **Project Settings → Script Properties** → add:
   | Property | Value |
   |---|---|
   | `OPSAGENT_BASE_URL` | the public URL from step 0 (no trailing slash) |
   | `BRIDGE_HMAC_SECRET` | same value as in `.env.local` |
   | `SENDER_NAME` | optional, e.g. `Jhunu's Crafts` |
5. In the editor, select `tick` → **Run**. Approve the permissions: Gmail read/send, external requests,
   and your email address. Google warns the app is unverified because it's your own script:
   **Advanced → Go to OpsAgent bridge**.
6. Check **Executions**: no errors. In OpsAgent, **Settings** should say "Gmail bridge last seen 0m ago".
7. **Triggers** (clock icon) → **Add trigger** → function `tick`, event source **Time-driven**,
   **Minutes timer → Every 5 minutes**.

What it does every 5 minutes: new inbox mail (last 2 days) → `/api/bridge/ingest`; then
`/api/bridge/tick` runs queued pipeline jobs; then it claims approved replies, sends them **in the
original Gmail thread**, and acks. A `sent_<id>` marker is written *before* the ack, so a crash
mid-send can never send twice.

Quotas (consumer Gmail): ~100 recipients/day, 90 min of trigger runtime/day. The server caps
sends at `OUTBOUND_DAILY_CAP` (80) in a rolling 24 h, and each run stops after ~20 s.

## 3. Telegram notifications

1. In Telegram, message **@BotFather** → `/newbot` → pick a name → copy the **token**.
2. Put it in `.env.local` as `TELEGRAM_BOT_TOKEN=…` and restart `pnpm dev`.
3. Register the webhook (replace the placeholders; the secret is `TELEGRAM_WEBHOOK_SECRET`):
   ```sh
   curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d url="<PUBLIC_URL>/api/telegram/webhook" \
     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" \
     -d allowed_updates='["message","callback_query"]'
   ```
4. Open your bot in Telegram and send `/start`. It replies with your chat ID.
5. OpsAgent → **Settings → Telegram chat IDs** → paste it → Save. Only listed chats can press
   Approve/Reject; everyone else gets "not allowed".

Every ticket that needs review now arrives with **✅ Approve / ✏️ Open / ❌ Reject** buttons
(Open only appears when `APP_BASE_URL` is https). A reminder is sent when tickets wait longer
than *Remind reviewers after* minutes.

## 4. Backup scheduler (after deploying)

GitHub repo → Settings → Secrets and variables → Actions → add `OPSAGENT_BASE_URL` and
`CRON_SECRET`. `.github/workflows/tick-backup.yml` then ticks every 15 minutes. Until both
secrets exist it skips quietly.

## 5. End-to-end test

1. From another email account, write to the test Gmail.
2. Within 5 minutes: a ticket appears in `/queue`, and Telegram shows it with a draft.
3. Tap **✅ Approve**. Within 5 more minutes the reply arrives **in the same email thread**, exactly once.
4. Crash test: in the script, temporarily add `throw new Error('crash')` right after
   `P.setProperty(key, …)` in `flushOutbox_`, approve another ticket, and run `tick` (it "crashes").
   Remove the line and run `tick` again: the server re-offers the email, the script sees the
   marker and only acks, so there's **still exactly one reply**.
