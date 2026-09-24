import { describe, expect, it } from 'vitest';
import { reviewMessage } from '@/server/adapters/notify/telegram';

const base = {
  ticketId: '11111111-1111-1111-1111-111111111111',
  draftId: '22222222-2222-2222-2222-222222222222',
  subject: 'Torn strap',
  intent: 'complaint_return',
  urgency: 'high',
  riskFlags: ['damaged_item'],
  snippet: 'Call me at [PHONE]',
  draft: 'Sorry to hear that.',
  baseUrl: 'https://ops.example.com',
};

describe('telegram review message', () => {
  it('has approve/open/reject buttons with callback data under 64 bytes', () => {
    const m = reviewMessage(base);
    const row = m.reply_markup.inline_keyboard[0];
    expect(row.map((b) => b.text)).toEqual(['✅ Approve', '✏️ Open', '❌ Reject']);
    expect(row[0].callback_data).toBe(`a:${base.draftId}`);
    for (const b of row) if (b.callback_data) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
    expect(row[1].url).toBe(`https://ops.example.com/tickets/${base.ticketId}`);
    expect(m.text).toContain('HIGH urgency');
    expect(m.text).toContain('[PHONE]');
  });

  it('omits the Open button for non-https (local) URLs, which Telegram rejects', () => {
    const row = reviewMessage({ ...base, baseUrl: 'http://localhost:3000' }).reply_markup.inline_keyboard[0];
    expect(row.map((b) => b.text)).toEqual(['✅ Approve', '❌ Reject']);
  });

  it('stays under the Telegram 4096-char limit with a huge draft, and has no buttons without a draft', () => {
    expect(reviewMessage({ ...base, draft: 'x'.repeat(10_000) }).text.length).toBeLessThanOrEqual(4000);
    const none = reviewMessage({ ...base, draftId: null, draft: null, baseUrl: 'http://localhost' });
    expect(none.reply_markup.inline_keyboard[0]).toEqual([]);
    expect(none.text).toContain('No draft');
  });
});
