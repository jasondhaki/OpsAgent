import 'server-only';
import type { Db } from '@/server/db/admin';
import { env } from '@/server/env';

// ponytail: one bridge secret ⇒ one tenant (DEFAULT_ORG_SLUG). Per-org secrets when a second business signs up.
export async function defaultOrgId(db: Db): Promise<string> {
  const { data, error } = await db.from('orgs').select('id').eq('slug', env.DEFAULT_ORG_SLUG).single();
  if (error) throw new Error(`default org '${env.DEFAULT_ORG_SLUG}' not found`);
  return data.id;
}
