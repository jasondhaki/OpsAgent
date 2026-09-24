import 'server-only';
import { createHash } from 'node:crypto';
import type { Db } from '@/server/db/admin';

/** Fixed-window limiter backed by hit_rate_limit(); true while `key` is within `max` hits per window. */
export async function allow(db: Db, key: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await db.rpc('hit_rate_limit', { p_key: key, p_window_seconds: windowSeconds, p_max: max });
  if (error) throw error;
  return data === true;
}

/**
 * Hashed client IP for rate-limit keys (we never store raw IPs). Host-agnostic: first X-Forwarded-For
 * hop, which Netlify/Vercel/Cloudflare all set. Spoofable only on hosts that pass it through unchecked.
 */
export function clientKey(headers: Headers): string {
  const ip = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`opsagent:${ip}`).digest('hex').slice(0, 32);
}
