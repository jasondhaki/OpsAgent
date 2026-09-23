import 'server-only';
import type { Db } from '@/server/db/admin';
import type { Database } from '@/lib/database.types';

export type Job = Database['public']['Tables']['jobs']['Row'];
export type JobHandlers = Record<string, (job: Job) => Promise<void>>;

const BACKOFF_BASE_S = 30;

/** Claim and run jobs until the time budget is spent or the queue is empty. */
export async function runJobs(
  db: Db,
  handlers: JobHandlers,
  { budgetMs = 8000, batch = 3, leaseSeconds = 60 } = {},
): Promise<{ ran: number }> {
  const started = Date.now();
  let ran = 0;
  while (Date.now() - started < budgetMs) {
    const { data: jobs, error } = await db.rpc('claim_jobs', { p_limit: batch, p_lease_seconds: leaseSeconds });
    if (error) throw error;
    if (!jobs.length) break;

    for (const job of jobs) {
      ran++;
      const now = new Date();
      try {
        // A job whose lease keeps expiring (e.g. it crashes the process) must not loop forever.
        if (job.attempts > job.max_attempts) throw new Error('lease expired too many times');
        const handler = handlers[job.type];
        if (!handler) throw new Error(`no handler for job type ${job.type}`);
        await handler(job);
        await db
          .from('jobs')
          .update({ status: 'done', locked_until: null, last_error: null, updated_at: now.toISOString() })
          .eq('id', job.id);
      } catch (e) {
        const dead = job.attempts >= job.max_attempts;
        const retryAt = new Date(now.getTime() + BACKOFF_BASE_S * 1000 * 2 ** (job.attempts - 1));
        await db
          .from('jobs')
          .update({
            status: dead ? 'dead' : 'queued',
            run_after: retryAt.toISOString(),
            locked_until: null,
            last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
            updated_at: now.toISOString(),
          })
          .eq('id', job.id);
      }
    }
  }
  return { ran };
}
