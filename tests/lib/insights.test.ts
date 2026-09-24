import { describe, expect, it } from 'vitest';
import { computeInsights } from '@/lib/insights';

const now = Date.parse('2026-09-24T12:00:00Z');
const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

describe('computeInsights', () => {
  const r = computeInsights({
    now,
    days: 3,
    tickets: [
      { id: 'a', created_at: at(60), intent: 'product_question', status: 'sent', gate: { wouldAutosend: true } },
      { id: 'b', created_at: at(90), intent: 'product_question', status: 'sent', gate: { wouldAutosend: false } },
      { id: 'c', created_at: at(24 * 60 + 10), intent: 'complaint_return', status: 'error', gate: null },
    ],
    events: [
      { ticket_id: 'a', type: 'ingested', data: {}, created_at: at(60) },
      { ticket_id: 'a', type: 'drafted', data: {}, created_at: at(58) },
      { ticket_id: 'a', type: 'approved', data: { edited: false }, created_at: at(40) },
      { ticket_id: 'a', type: 'sent', data: {}, created_at: at(30) },
      { ticket_id: 'b', type: 'ingested', data: {}, created_at: at(90) },
      { ticket_id: 'b', type: 'drafted', data: {}, created_at: at(86) },
      { ticket_id: 'b', type: 'approved', data: { edited: true }, created_at: at(50) },
    ],
    runs: [
      { provider: 'google', ok: true, step: 'classify' },
      { provider: 'groq', ok: true, step: 'draft' },
      { provider: 'google', ok: false, step: 'draft' },
      { provider: 'google', ok: true, step: 'embed' }, // embeddings don't count toward fallback
    ],
  });

  it('counts tickets per Dhaka day, zero-filled, oldest first', () => {
    expect(r.perDay.map((d) => d.count)).toEqual([0, 1, 2]);
  });
  it('would-autosend rate is over gated tickets only', () => {
    expect(r.wouldAutosendRate).toBe(0.5);
    expect(r.gatedCount).toBe(2);
  });
  it('approve-without-edit per intent', () => {
    expect(r.approvals).toEqual([{ intent: 'product_question', approved: 2, unedited: 1 }]);
  });
  it('median minutes to draft and to send', () => {
    expect(r.medianMinutesToDraft).toBe(3); // 2 and 4
    expect(r.medianMinutesToSend).toBe(30);
  });
  it('fallback rate and error count', () => {
    expect(r.fallbackRate).toBe(0.5);
    expect(r.errors).toBe(2); // one error ticket + one failed run
  });
  it('handles no data', () => {
    const e = computeInsights({ now, days: 7, tickets: [], events: [], runs: [] });
    expect(e.wouldAutosendRate).toBeNull();
    expect(e.medianMinutesToSend).toBeNull();
    expect(e.perDay).toHaveLength(7);
  });
});
