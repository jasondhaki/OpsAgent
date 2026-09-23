import { describe, expect, it } from 'vitest';
import { Classification, OrgSettings } from '@/lib/contracts';

describe('contracts', () => {
  it('OrgSettings defaults are safe: autosend off, no intents', () => {
    const s = OrgSettings.parse({});
    expect(s.autosendEnabled).toBe(false);
    expect(s.autosendIntents).toEqual([]);
  });

  it('OrgSettings rejects non-RAG intents for autosend', () => {
    expect(OrgSettings.safeParse({ autosendIntents: ['complaint_return'] }).success).toBe(false);
  });

  it('Classification rejects intents not in the SQL enum (v1 billing_issue bug)', () => {
    const base = {
      urgency: 'low', sentiment: 'neutral', language: 'en', orderRef: null,
      productMentions: [], lead: null, riskFlags: [], reasoning: '',
    };
    expect(Classification.safeParse({ ...base, intent: 'billing_issue' }).success).toBe(false);
    expect(Classification.safeParse({ ...base, intent: 'product_question' }).success).toBe(true);
  });

  it('Classification drops any LLM-supplied oversight field', () => {
    const parsed = Classification.parse({
      intent: 'other', urgency: 'low', sentiment: 'neutral', language: 'en', orderRef: null,
      productMentions: [], lead: null, riskFlags: [], reasoning: '', requiresHumanReview: false,
    });
    expect(parsed).not.toHaveProperty('requiresHumanReview');
  });
});
