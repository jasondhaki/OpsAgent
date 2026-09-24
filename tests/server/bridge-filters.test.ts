import { describe, expect, it } from 'vitest';
import { automatedReason, parseAddress } from '@/server/bridge/ingest';

const msg = (from: string, headers: Record<string, string> = {}) => ({ from, headers });

describe('parseAddress', () => {
  it('handles display names, bare addresses, and garbage', () => {
    expect(parseAddress('Rina Akter <Rina.Demo@Example.com>')).toBe('rina.demo@example.com');
    expect(parseAddress('rina@example.com')).toBe('rina@example.com');
    expect(parseAddress('"Shop" <shop@example.com>')).toBe('shop@example.com');
    expect(parseAddress('no address here')).toBeNull();
  });
});

describe('automatedReason (loop protection)', () => {
  it('lets a normal customer email through', () => {
    expect(automatedReason(msg('Rina <rina@example.com>', { 'Auto-Submitted': 'no' }))).toBeNull();
  });

  it.each([
    [{ 'Auto-Submitted': 'auto-replied' }, 'auto_submitted'],
    [{ 'auto-submitted': 'auto-generated' }, 'auto_submitted'],
    [{ Precedence: 'bulk' }, 'precedence'],
    [{ Precedence: 'LIST' }, 'precedence'],
    [{ 'List-Id': '<news.example.com>' }, 'mailing_list'],
    [{ 'X-Autoreply': 'yes' }, 'autoreply'],
  ])('drops %o', (headers, reason) => {
    expect(automatedReason(msg('someone@example.com', headers))).toBe(reason);
  });

  it('drops bounces, no-reply senders, and our own mail', () => {
    expect(automatedReason(msg('MAILER-DAEMON@googlemail.com'))).toBe('system_sender');
    expect(automatedReason(msg('Shop <no-reply@shop.example>'))).toBe('system_sender');
    expect(automatedReason(msg('Jhunu <jhunu.crafts@gmail.com>', { 'X-OpsAgent-Account': 'Jhunu.Crafts@gmail.com' }))).toBe('own_address');
  });
});
