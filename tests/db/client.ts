import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { Db } from '@/server/db/admin';

// Service-role client for the local Supabase stack; keys come from `supabase status`.
export function localDb(): Db {
  const out = execSync('pnpm exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (k: string) => new RegExp(`^${k}="?([^"\\n]+)"?`, 'm').exec(out)?.[1] ?? '';
  return createClient<Database>(get('API_URL'), get('SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
