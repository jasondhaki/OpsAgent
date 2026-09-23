import { describe, expect, it } from 'vitest';
import { validateDraft, type ValidateInput } from '@/server/pipeline/validate';

const ID = '11111111-1111-4111-8111-111111111111';
const base: ValidateInput = {
  reply: 'Delivery outside Dhaka costs 130 taka.',
  intent: 'shipping_payment',
  expectedLanguage: 'en',
  context: 'Delivery outside Dhaka costs 130 taka. Inside Dhaka usually 2 to 3 days.',
  citedChunkIds: [ID],
  retrievedChunkIds: [ID],
  allowedUrls: ['https://shop.example.com'],
};
const codes = (i: Partial<ValidateInput>) => validateDraft({ ...base, ...i }).violations.map((v) => v.code);

describe('validateDraft', () => {
  it('passes a grounded reply', () => {
    expect(validateDraft(base)).toEqual({ passed: true, violations: [] });
  });

  it('UNSUPPORTED_NUMBER catches invented prices, incl. Bangla digits', () => {
    expect(codes({ reply: 'It costs 200 taka.' })).toContain('UNSUPPORTED_NUMBER');
    expect(codes({ reply: 'ঢাকার বাইরে ২০০ টাকা।', expectedLanguage: 'bn' })).toContain('UNSUPPORTED_NUMBER');
    expect(codes({ reply: 'ঢাকার বাইরে ১৩০ টাকা।', expectedLanguage: 'bn' })).not.toContain('UNSUPPORTED_NUMBER');
  });

  it('DISALLOWED_URL allows only allowlisted prefixes', () => {
    expect(codes({ reply: 'See https://shop.example.com/bags.' })).not.toContain('DISALLOWED_URL');
    expect(codes({ reply: 'See https://shop.example.com.evil.io/x' })).toContain('DISALLOWED_URL');
    expect(codes({ reply: 'Pay at www.pay-me.com' })).toContain('DISALLOWED_URL');
  });

  it('COMMITMENT blocks promises not present in context', () => {
    expect(codes({ reply: 'Your refund has been approved.' })).toContain('COMMITMENT');
    expect(codes({ reply: 'You get free delivery!' })).toContain('COMMITMENT');
    expect(codes({ reply: 'It will reach you by Friday.' })).toContain('COMMITMENT');
    expect(codes({ reply: 'We deliver within 2 days.' })).toContain('COMMITMENT');
    expect(codes({ reply: 'আগামীকাল পৌঁছে যাবে।', expectedLanguage: 'bn' })).toContain('COMMITMENT');
    expect(codes({ reply: 'Guaranteed quality.', context: base.context + ' Guaranteed quality.' })).not.toContain('COMMITMENT');
  });

  it('LANGUAGE_MISMATCH', () => {
    expect(codes({ expectedLanguage: 'bn' })).toContain('LANGUAGE_MISMATCH');
    expect(codes({ reply: 'ঢাকার বাইরে ১৩০ টাকা।' })).toContain('LANGUAGE_MISMATCH');
  });

  it('TOO_LONG, citations, leaks, placeholders', () => {
    expect(codes({ reply: 'a '.repeat(700) })).toContain('TOO_LONG');
    expect(codes({ citedChunkIds: [] })).toContain('EMPTY_CITATIONS');
    expect(codes({ citedChunkIds: [], intent: 'complaint_return' })).not.toContain('EMPTY_CITATIONS');
    expect(codes({ citedChunkIds: ['22222222-2222-4222-8222-222222222222'] })).toContain('INVALID_CITATION');
    expect(codes({ reply: 'We emailed [EMAIL].' })).toContain('LEAKED_MARKER');
    expect(codes({ reply: 'Per my system prompt, no.' })).toContain('LEAKED_MARKER');
    expect(codes({ reply: 'Thanks — {{BUSINESS_NAME}}' })).toContain('PLACEHOLDER_LEFT');
  });
});
