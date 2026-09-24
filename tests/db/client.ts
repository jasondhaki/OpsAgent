import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { Db } from '@/server/db/admin';

// Clients for the local Supabase stack; keys come from `supabase status`.
function status() {
  const out = execSync('pnpm exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return (k: string) => new RegExp(`^${k}="?([^"\n]+)"?`, 'm').exec(out)?.[1] ?? '';
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client (bypasses RLS). */
export function localDb(): Db {
  const get = status();
  return createClient<Database>(get('API_URL'), get('SERVICE_ROLE_KEY'), opts);
}

/** Anon-key client, i.e. what a browser/dashboard user gets; sign in to act as `authenticated`. */
export function localAnon(): Db {
  const get = status();
  return createClient<Database>(get('API_URL'), get('ANON_KEY'), opts);
}
