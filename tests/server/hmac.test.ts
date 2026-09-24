import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, readSigned, sign, verify } from '@/server/security/hmac';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const now = 1_790_000_000;
const ts = String(now);
const body = '{"x":1}';
const secrets = [{ name: 'bridge', secret: A }, { name: 'cron', secret: B }];

describe('hmac verify', () => {
  it('accepts a valid signature and names the signer', () => {
    expect(verify(secrets, { timestamp: ts, signature: sign(A, ts, body) }, body, now)).toBe('bridge');
    expect(verify(secrets, { timestamp: ts, signature: sign(B, ts, body) }, body, now)).toBe('cron');
  });

  it('rejects a tampered body, wrong secret, and missing headers', () => {
    expect(verify(secrets, { timestamp: ts, signature: sign(A, ts, body) }, '{"x":2}', now)).toBeNull();
    expect(verify(secrets, { timestamp: ts, signature: sign('c'.repeat(32), ts, body) }, body, now)).toBeNull();
    expect(verify(secrets, { timestamp: null, signature: sign(A, ts, body) }, body, now)).toBeNull();
    expect(verify(secrets, { timestamp: ts, signature: 'zz' }, body, now)).toBeNull();
  });

  it('rejects timestamps outside ±300 s (replay window)', () => {
    const old = String(now - 301);
    expect(verify(secrets, { timestamp: old, signature: sign(A, old, body) }, body, now)).toBeNull();
    const edge = String(now - 300);
    expect(verify(secrets, { timestamp: edge, signature: sign(A, edge, body) }, body, now)).toBe('bridge');
  });

  it('ignores unset secrets (an empty secret must never verify)', () => {
    expect(verify([{ name: 'x', secret: undefined }], { timestamp: ts, signature: sign('', ts, body) }, body, now)).toBeNull();
  });
});

describe('readSigned', () => {
  const req = (raw: string, headers: Record<string, string>) => new Request('http://x/api', { method: 'POST', body: raw, headers });
  const nowTs = () => String(Math.floor(Date.now() / 1000));

  it('parses a correctly signed body', async () => {
    const t = nowTs();
    const r = await readSigned(req(body, { 'x-opsagent-timestamp': t, 'x-opsagent-signature': sign(A, t, body) }), secrets);
    expect(r).toEqual({ signer: 'bridge', json: { x: 1 } });
  });

  it('401 unsigned, 413 oversized, 503 unconfigured', async () => {
    expect(((await readSigned(req(body, {}), secrets)) as Response).status).toBe(401);
    const big = 'x'.repeat(MAX_BODY_BYTES + 1);
    const t = nowTs();
    expect(((await readSigned(req(big, { 'x-opsagent-timestamp': t, 'x-opsagent-signature': sign(A, t, big) }), secrets)) as Response).status).toBe(413);
    expect(((await readSigned(req(body, {}), [{ name: 'bridge', secret: undefined }])) as Response).status).toBe(503);
  });
});
