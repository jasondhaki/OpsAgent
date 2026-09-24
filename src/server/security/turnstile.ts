import 'server-only';
import { env } from '@/server/env';

/** Server-side Cloudflare Turnstile check. False when unconfigured, so the public demo fails closed. */
export async function verifyTurnstile(token: string | null | undefined, remoteIp?: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY || !token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token.slice(0, 2048) });
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
