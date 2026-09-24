import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { env } from '@/server/env';

/** Per-request client acting as the signed-in user: every read goes through RLS (member_read policies). */
export async function userDb() {
  const store = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {}
      },
    },
  });
}
