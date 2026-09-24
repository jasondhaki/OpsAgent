'use server';

import { redirect } from 'next/navigation';
import { userDb } from '@/server/db/user';
import { env } from '@/server/env';

export async function signInWithGoogle() {
  const { data, error } = await (await userDb()).auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${env.APP_BASE_URL}/auth/callback` },
  });
  if (error || !data.url) redirect('/login?error=oauth');
  redirect(data.url);
}
