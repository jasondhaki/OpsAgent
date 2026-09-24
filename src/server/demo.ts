import 'server-only';
import type { Json } from '@/lib/database.types';
import { sampleByKey } from '@/lib/samples';
import type { Db } from '@/server/db/admin';
import { createInbound } from '@/server/db/repos/tickets';
import { processTicket, type PipelineDeps, type ProcessResult } from '@/server/pipeline/orchestrator';
import { allow } from '@/server/security/rateLimit';

export const DEMO_PER_IP_PER_DAY = 10;
export const DEMO_GLOBAL_PER_DAY = 100;
// Serverless hosts cap request time (Netlify free: 26 s max); leave headroom.
const LIVE_DEADLINE_MS = 20_000;

export type DemoResponse =
  | { mode: 'live'; result: ProcessResult; ticketId: string; ms: number }
  | { mode: 'replay'; result: ProcessResult; ticketId: string | null; note: string }
  | { mode: 'unavailable'; note: string };

export async function demoOrgId(db: Db): Promise<string> {
  const { data, error } = await db.from('orgs').select('id').eq('slug', 'demo').eq('is_demo', true).single();
  if (error) throw new Error('demo org missing');
  return data.id;
}

async function replay(db: Db, sampleKey: string | null, why: string): Promise<DemoResponse> {
  const exact = sampleKey ? (await db.from('demo_traces').select('sample_key, ticket_id, result').eq('sample_key', sampleKey).maybeSingle()).data : null;
  const row = exact ?? (await db.from('demo_traces').select('sample_key, ticket_id, result').order('updated_at', { ascending: false }).limit(1).maybeSingle()).data;
  if (!row) return { mode: 'unavailable', note: `${why} No recorded run is available yet — try again later.` };
  const label = sampleByKey(row.sample_key)?.label ?? row.sample_key;
  return { mode: 'replay', result: row.result as unknown as ProcessResult, ticketId: row.ticket_id, note: `${why} Showing a recorded live run of the "${label}" sample instead.` };
}

/**
 * Public demo run: always dry-run in the demo org (is_demo ⇒ the gate never auto-sends and the DB
 * refuses outbox rows). Caller must have verified Turnstile.
 */
export async function runDemo(deps: PipelineDeps, i: { visitorKey: string; subject: string; body: string; sampleKey: string | null }): Promise<DemoResponse> {
  const { db } = deps;
  const sample = sampleByKey(i.sampleKey);
  const isSample = !!sample && sample.body === i.body.trim();
  if (!(await allow(db, `demo:ip:${i.visitorKey}`, 86_400, DEMO_PER_IP_PER_DAY))) return replay(db, sample?.key ?? null, `You've used your ${DEMO_PER_IP_PER_DAY} live runs for today.`);
  if (!(await allow(db, 'demo:global', 86_400, DEMO_GLOBAL_PER_DAY))) return replay(db, sample?.key ?? null, "Today's live demo budget is used up.");

  const started = Date.now();
  let ticketId: string;
  let result: ProcessResult;
  try {
    const orgId = await demoOrgId(db);
    ({ ticketId } = await createInbound(db, { orgId, channel: 'simulator', fromEmail: 'visitor@demo.invalid', subject: i.subject || null, body: i.body }));
    result = await processTicket(deps, ticketId, { dryRun: true, deadlineMs: started + LIVE_DEADLINE_MS });
  } catch (e) {
    console.warn({ msg: 'demo_run_failed', error: e instanceof Error ? e.message.slice(0, 200) : 'unknown' });
    return replay(db, sample?.key ?? null, 'The live run failed.');
  }
  if (result.reason === 'ai_unavailable') return replay(db, sample?.key ?? null, 'The free AI quota is exhausted right now.');
  if (result.outcome === 'deferred') return replay(db, sample?.key ?? null, 'The models were too slow just now.');
  if (isSample) {
    await db.from('demo_traces').upsert({ sample_key: sample.key, ticket_id: ticketId, result: result as unknown as Json, updated_at: new Date().toISOString() });
  }
  return { mode: 'live', result, ticketId, ms: Date.now() - started };
}
