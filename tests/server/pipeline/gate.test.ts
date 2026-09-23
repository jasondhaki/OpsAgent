import { describe, expect, it } from 'vitest';
import { evaluateGate, type GateInput } from '@/server/pipeline/gate';
import { OrgSettings } from '@/lib/contracts';

const pass: GateInput = {
  intent: 'shipping_payment',
  riskFlags: [],
  sentiment: 'neutral',
  urgency: 'low',
  topSimilarity: 0.8,
  orderVerified: false,
  validator: { passed: true, violations: [] },
  groundedness: { verdict: 'supported', unsupportedClaims: [] },
  needsHumanBecause: null,
  autoRepliesInThread24h: 0,
  draftTier: 'primary',
  customerBlocked: false,
  settings: OrgSettings.parse({ autosendEnabled: true, autosendIntents: ['shipping_payment', 'order_status'] }),
  isDemo: false,
};
const failed = (i: Partial<GateInput>) =>
  evaluateGate({ ...pass, ...i }).checks.filter((c) => !c.passed).map((c) => c.id);

describe('evaluateGate', () => {
  it('all checks pass → wouldAutosend and autosend', () => {
    const d = evaluateGate(pass);
    expect(d.wouldAutosend).toBe(true);
    expect(d.autosend).toBe(true);
    expect(d.checks).toHaveLength(11);
    expect(d.score).toBe(1);
  });

  it.each([
    [{ intent: 'custom_bulk_order' }, 'intent_allowed'],
    [{ intent: 'complaint_return' }, 'intent_allowed'],
    [{ intent: 'payment_issue' }, 'intent_allowed'],
    [{ intent: 'other' }, 'intent_allowed'],
    [{ riskFlags: ['prompt_injection_suspected'] }, 'no_risk_flags'],
    [{ sentiment: 'negative' }, 'sentiment_ok'],
    [{ sentiment: 'hostile' }, 'sentiment_ok'],
    [{ urgency: 'high' }, 'urgency_ok'],
    [{ topSimilarity: 0.74 }, 'retrieval_strong'],
    [{ topSimilarity: null }, 'retrieval_strong'],
    [{ validator: { passed: false, violations: [{ code: 'COMMITMENT', detail: 'x' }] } }, 'validator_passed'],
    [{ validator: null }, 'validator_passed'],
    [{ groundedness: { verdict: 'partially_supported' as const, unsupportedClaims: [] } }, 'grounded'],
    [{ groundedness: null }, 'grounded'],
    [{ needsHumanBecause: 'price not in KB' }, 'no_human_request'],
    [{ autoRepliesInThread24h: 1 }, 'thread_cap'],
    [{ draftTier: 'fallback' as const }, 'primary_model'],
    [{ draftTier: null }, 'primary_model'],
    [{ customerBlocked: true }, 'customer_ok'],
  ] as [Partial<GateInput>, string][])('%o fails %s and blocks auto-send', (override, id) => {
    const d = evaluateGate({ ...pass, ...override });
    expect(failed(override)).toContain(id);
    expect(d.wouldAutosend).toBe(false);
    expect(d.autosend).toBe(false);
  });

  it('order_status needs a verified lookup instead of similarity', () => {
    expect(failed({ intent: 'order_status', topSimilarity: null, orderVerified: false })).toEqual(['retrieval_strong']);
    expect(evaluateGate({ ...pass, intent: 'order_status', topSimilarity: null, orderVerified: true }).wouldAutosend).toBe(true);
  });

  it('shadow mode: wouldAutosend true but autosend false when disabled, intent not enabled, or demo org', () => {
    for (const o of [
      { settings: OrgSettings.parse({}) },
      { settings: OrgSettings.parse({ autosendEnabled: true, autosendIntents: ['product_question'] }) },
      { isDemo: true },
    ]) {
      const d = evaluateGate({ ...pass, ...o });
      expect(d.wouldAutosend).toBe(true);
      expect(d.autosend).toBe(false);
    }
  });

  it('score reflects weak retrieval proportionally', () => {
    expect(evaluateGate({ ...pass, topSimilarity: 0.6 }).score).toBeCloseTo(0.8);
  });
});
