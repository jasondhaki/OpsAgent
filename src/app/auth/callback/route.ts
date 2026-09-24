import { NextResponse, type NextRequest } from 'next/server';
import { userDb } from '@/server/db/user';
import { env } from '@/server/env';

// OAuth return: swap the one-time code for a session cookie. Membership is checked on every page.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const { error } = code ? await (await userDb()).auth.exchangeCodeForSession(code) : { error: true };
  return NextResponse.redirect(new URL(error ? '/login?error=oauth' : '/queue', env.APP_BASE_URL));
}
