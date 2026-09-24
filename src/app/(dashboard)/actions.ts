'use server';

import { redirect } from 'next/navigation';
import { userDb } from '@/server/db/user';

export async function signOut() {
  await (await userDb()).auth.signOut();
  redirect('/login');
}
