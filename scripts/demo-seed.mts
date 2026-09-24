// Seed the public demo: a small fictional inbox run through the real pipeline (dry run), plus one
// recorded run per simulator sample so /demo can replay when the free AI quota runs out.
// Usage: pnpm demo:seed [--samples-only]   (needs the demo KB loaded: pnpm kb load demo kb-seed/demo)
import type { Json } from '@/lib/database.types';
import { SAMPLES } from '@/lib/samples';
import { db } from '@/server/db/admin';
import { createInbound } from '@/server/db/repos/tickets';
import { demoOrgId } from '@/server/demo';
import { pipelineDeps } from '@/server/deps';
import { processTicket } from '@/server/pipeline/orchestrator';

// Fictional customers only (example.com); no real business facts.
const INBOX = [
  { from: 'rina.demo@example.com', subject: 'Delivery to Chattogram', body: 'Hello! How much is delivery to Chattogram and how long does it usually take?' },
  { from: 'karim.demo@example.com', subject: 'বাল্ক অর্ডার', body: 'আমাদের অফিসের জন্য ৫০টি পাটের ব্যাগ লাগবে, লোগো সহ। ডিসেম্বরের মধ্যে কি সম্ভব?' },
  { from: 'nadia.demo@example.com', subject: 'Wrong colour', body: 'I ordered a maroon shoulder bag but received a brown one. Order JC-10236.' },
  { from: 'tanvir.demo@example.com', subject: 'bkash payment', body: 'ami bkash e payment korechi kintu order confirm hoyni, trx id 8N7A6B5C4D' },
  { from: 'sadia.demo@example.com', subject: 'Leather care', body: 'How should I clean and care for the leather wallet?' },
  { from: 'promo@growth-hacks.example.com', subject: 'Boost your sales 10x!!!', body: 'We can get you 10,000 followers overnight. Reply now for a special price.' },
];

const deps = pipelineDeps();
const orgId = await demoOrgId(db);
const pace = () => new Promise((r) => setTimeout(r, 8000)); // free-tier RPM

for (const m of process.argv.includes('--samples-only') ? [] : INBOX) {
  const { ticketId } = await createInbound(db, { orgId, channel: 'email', fromEmail: m.from, subject: m.subject, body: m.body, externalThreadId: `demo-${m.subject}` });
  const r = await processTicket(deps, ticketId, { dryRun: true, deadlineMs: Date.now() + 120_000 });
  console.log(`inbox   ${m.subject.padEnd(24)} → ${r.outcome}${r.reason ? ` (${r.reason})` : ''} · ${r.classification?.intent ?? '-'}`);
  await pace();
}

for (const s of SAMPLES) {
  const { ticketId } = await createInbound(db, { orgId, channel: 'simulator', fromEmail: 'visitor@demo.invalid', subject: s.subject, body: s.body });
  const r = await processTicket(deps, ticketId, { dryRun: true, deadlineMs: Date.now() + 120_000 });
  if (r.reason === 'ai_unavailable') {
    console.log(`sample  ${s.key.padEnd(10)} → AI unavailable, not recorded`);
  } else {
    await db.from('demo_traces').upsert({ sample_key: s.key, ticket_id: ticketId, result: r as unknown as Json, updated_at: new Date().toISOString() });
    console.log(`sample  ${s.key.padEnd(10)} → recorded (${r.outcome}, would auto-send: ${r.gate?.wouldAutosend ?? false})`);
  }
  await pace();
}
