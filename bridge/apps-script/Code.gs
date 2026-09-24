/**
 * OpsAgent Gmail bridge. Runs as the business Gmail account, every 5 minutes (time-driven trigger on `tick`).
 * 1. ingest_:       new inbox mail  → POST /api/bridge/ingest   (server dedupes, so overlap is harmless)
 * 2. tick:          POST /api/bridge/tick (server processes queued jobs; also keeps Supabase awake)
 * 3. flushOutbox_:  claim approved replies → send from Gmail (in-thread) → ack
 *
 * Every request is signed: X-OpsAgent-Signature = hex(HMAC-SHA256(secret, `${timestamp}.${body}`)).
 * Script Properties: OPSAGENT_BASE_URL, BRIDGE_HMAC_SECRET, optional SENDER_NAME. CURSOR is managed here.
 */
const P = PropertiesService.getScriptProperties();
const HEADERS = ['Auto-Submitted', 'Precedence', 'List-Id', 'X-Autoreply', 'X-Autorespond', 'In-Reply-To', 'Authentication-Results'];
const TIME_BUDGET_MS = 20 * 1000;

function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // previous run still going
  const started = Date.now();
  try {
    step_('ingest', ingest_);
    step_('tick', function () { post_('/api/bridge/tick', {}); });
    step_('outbox', function () { flushOutbox_(started); });
    step_('prune', pruneSentMarkers_);
  } finally {
    lock.releaseLock();
  }
}

// One failing step (e.g. server down) must not stop the others.
function step_(name, fn) {
  try { fn(); } catch (e) { console.error(name + ' failed: ' + e); }
}

function ingest_() {
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  const cursor = Number(P.getProperty('CURSOR') || 0);
  const since = cursor - 10 * 60 * 1000; // 10 min overlap: clock skew / late indexing
  let newest = cursor;
  let allOk = true;
  const threads = GmailApp.search('in:inbox newer_than:2d', 0, 30);
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      const at = m.getDate().getTime();
      if (at <= since) return;
      if (m.getFrom().toLowerCase().indexOf(me) !== -1) return; // our own replies
      const headers = { 'X-OpsAgent-Account': me };
      HEADERS.forEach(function (h) {
        const v = m.getHeader(h);
        if (v) headers[h] = String(v).slice(0, 2000);
      });
      const res = post_('/api/bridge/ingest', {
        gmailMessageId: m.getId(),
        gmailThreadId: thread.getId(),
        rfcMessageId: (m.getHeader('Message-ID') || m.getId()).slice(0, 998),
        from: m.getFrom().slice(0, 320),
        to: m.getTo().slice(0, 2000),
        subject: m.getSubject().slice(0, 998),
        date: m.getDate().toISOString(),
        plainBody: m.getPlainBody().slice(0, 50000),
        headers: headers,
      });
      if (res.code >= 200 && res.code < 300) newest = Math.max(newest, at);
      else { allOk = false; console.error('ingest ' + res.code + ': ' + res.text.slice(0, 200)); }
    });
  });
  // Only move the cursor when everything was accepted, so nothing is skipped after an outage.
  if (allOk && newest > cursor) P.setProperty('CURSOR', String(newest));
}

function flushOutbox_(started) {
  const res = post_('/api/bridge/outbox/claim', { limit: 10 });
  if (res.code !== 200) throw new Error('claim ' + res.code + ': ' + res.text.slice(0, 200));
  const items = JSON.parse(res.text).items || [];
  const acks = [];
  const name = P.getProperty('SENDER_NAME') || undefined;
  for (let i = 0; i < items.length; i++) {
    if (Date.now() - started > TIME_BUDGET_MS) break; // unsent items' leases expire and are re-claimed next run
    const it = items[i];
    const key = 'sent_' + it.id;
    const done = P.getProperty(key);
    if (done) { // crashed after sending but before acking last time: never send twice, just re-ack
      acks.push({ id: it.id, ok: true, sentRef: JSON.parse(done).ref });
      continue;
    }
    try {
      let ref = null;
      if (it.replyToProviderMessageId) {
        const opts = name ? { name: name } : {};
        const original = GmailApp.getMessageById(it.replyToProviderMessageId);
        original.reply(it.body, opts); // in-thread, to the original sender
        ref = original.getThread().getId();
      } else {
        GmailApp.sendEmail(it.to, it.subject || '', it.body, name ? { name: name } : {});
      }
      P.setProperty(key, JSON.stringify({ at: Date.now(), ref: ref })); // record BEFORE acking
      acks.push({ id: it.id, ok: true, sentRef: ref });
    } catch (e) {
      acks.push({ id: it.id, ok: false, error: String(e).slice(0, 500) });
    }
  }
  if (acks.length) {
    const a = post_('/api/bridge/outbox/ack', { items: acks });
    if (a.code !== 200) throw new Error('ack ' + a.code + ': ' + a.text.slice(0, 200)); // markers make the retry safe
  }
}

function pruneSentMarkers_() {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const all = P.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sent_') === 0 && JSON.parse(all[k]).at < cutoff) P.deleteProperty(k);
  });
}

function post_(path, obj) {
  const base = P.getProperty('OPSAGENT_BASE_URL');
  const secret = P.getProperty('BRIDGE_HMAC_SECRET');
  if (!base || !secret) throw new Error('Set OPSAGENT_BASE_URL and BRIDGE_HMAC_SECRET in Script Properties');
  const body = JSON.stringify(obj);
  const ts = String(Math.floor(Date.now() / 1000));
  // Sign and send the exact same UTF-8 bytes (Bangla text!).
  const bytes = Utilities.newBlob(body).getBytes();
  const sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(ts + '.' + body).getBytes(), Utilities.newBlob(secret).getBytes())
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
  const res = UrlFetchApp.fetch(base.replace(/\/$/, '') + path, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: bytes,
    headers: { 'X-OpsAgent-Timestamp': ts, 'X-OpsAgent-Signature': sig },
    muteHttpExceptions: true,
  });
  return { code: res.getResponseCode(), text: res.getContentText() };
}
