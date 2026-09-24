import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Machine-to-machine auth (CLAUDE.md §8.1):
// X-OpsAgent-Timestamp = unix seconds, X-OpsAgent-Signature = hex(HMAC-SHA256(secret, `${ts}.${rawBody}`)).

export const MAX_SKEW_S = 300;

export const sign = (secret: string, timestamp: string, rawBody: string) =>
  createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

export type NamedSecret = { name: string; secret: string | undefined };

/** Name of the secret that signed the request, or null. Checks the timestamp window before any crypto. */
export function verify(
  secrets: NamedSecret[],
  headers: { timestamp: string | null; signature: string | null },
  rawBody: string,
  nowS = Math.floor(Date.now() / 1000),
): string | null {
  const { timestamp, signature } = headers;
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return null;
  if (Math.abs(nowS - Number(timestamp)) > MAX_SKEW_S) return null;
  const given = Buffer.from(signature.toLowerCase(), 'hex');
  for (const { name, secret } of secrets) {
    if (!secret) continue;
    if (timingSafeEqual(given, Buffer.from(sign(secret, timestamp, rawBody), 'hex'))) return name;
  }
  return null;
}

export const MAX_BODY_BYTES = 100 * 1024;

/**
 * Read the raw body (size-capped) and verify it. Returns the parsed JSON and the signer name,
 * or a Response to return as-is.
 */
export async function readSigned(req: Request, secrets: NamedSecret[]): Promise<{ signer: string; json: unknown } | Response> {
  if (!secrets.some((s) => s.secret)) return Response.json({ error: 'not configured' }, { status: 503 });
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return Response.json({ error: 'too large' }, { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return Response.json({ error: 'too large' }, { status: 413 });
  const signer = verify(secrets, { timestamp: req.headers.get('x-opsagent-timestamp'), signature: req.headers.get('x-opsagent-signature') }, raw);
  if (!signer) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return { signer, json: raw ? JSON.parse(raw) : {} };
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
}
