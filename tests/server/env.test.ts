import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
const { parseEnv } = await import('@/server/env');

describe('env', () => {
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  };

  it('fails fast without Supabase keys and names the field, not the value', () => {
    expect(() => parseEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('rejects short secrets', () => {
    expect(() => parseEnv({ ...base, BRIDGE_HMAC_SECRET: 'short' })).toThrow(/BRIDGE_HMAC_SECRET/);
  });

  it('applies defaults', () => {
    const e = parseEnv(base);
    expect(e.ORDER_ADAPTER).toBe('mock');
    expect(e.OUTBOUND_DAILY_CAP).toBe(80);
  });
});
