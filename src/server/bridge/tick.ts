import 'server-only';
import type { Db } from '@/server/db/admin';
import { remindReviewers } from '@/server/adapters/notify/telegram';
import { jobHandlers, type HandlerDeps } from '@/server/jobs/handlers';
import { runJobs } from '@/server/jobs/runner';
import { reapStaleClaims } from './outbox';

/**
 * One scheduler beat (Apps Script every 5 min, GitHub Actions every 15 as backup):
 * heartbeat, surface dead sends, remind reviewers, then run queued jobs within the time budget.
 * Also what keeps the free Supabase project from pausing.
 */
export async function tick(deps: HandlerDeps, orgId: string, source: 'bridge' | 'cron', budgetMs = 8000) {
  const { db } = deps;
  await heartbeat(db, orgId, source);
  const reaped = await reapStaleClaims(db);
  let reminded = false;
  try {
    reminded = await remindReviewers(db, orgId);
  } catch (e) {
    console.warn({ msg: 'remind_failed', error: e instanceof Error ? e.message.slice(0, 200) : 'unknown' });
  }
  const { ran } = await runJobs(db, jobHandlers(deps), { budgetMs, batch: 3, leaseSeconds: 60 });
  return { ran, reaped, reminded };
}

async function heartbeat(db: Db, orgId: string, source: 'bridge' | 'cron') {
  const { error } = await db.from('bridge_heartbeats').upsert({ org_id: orgId, source, last_seen_at: new Date().toISOString() });
  if (error) throw error;
}
