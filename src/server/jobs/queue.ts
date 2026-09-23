import 'server-only';
import type { Db } from '@/server/db/admin';
import type { Json } from '@/lib/database.types';

export type JobType = 'process_ticket' | 'embed_document' | 'sync_catalog' | 'remind_reviewers';

export async function enqueueJob(db: Db, job: { orgId: string | null; type: JobType; payload: Json }): Promise<string> {
  const { data, error } = await db
    .from('jobs')
    .insert({ org_id: job.orgId, type: job.type, payload: job.payload })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
