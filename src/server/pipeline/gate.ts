import 'server-only';
import { AUTOSEND_INTENTS, type GateDecision, type GroundednessReport, type OrgSettings, type ValidatorReport } from '@/lib/contracts';
import { RAG_INTENTS } from './validate';

export type GateInput = {
  intent: string;
  riskFlags: string[];
  sentiment: string;
  urgency: string;
  topSimilarity: number | null; // RAG intents
  orderVerified: boolean; // order_status: lookup found and sender == email on file
  validator: ValidatorReport | null;
  groundedness: GroundednessReport | null; // null = not run / skipped ⇒ fails
  needsHumanBecause: string | null;
  autoRepliesInThread24h: number;
  draftTier: 'primary' | 'fallback' | null;
  customerBlocked: boolean;
  settings: OrgSettings;
  isDemo: boolean;
};

/** Pure, deterministic auto-send decision. The LLM never decides its own oversight. */
export function evaluateGate(g: GateInput): GateDecision {
  const isRag = (RAG_INTENTS as readonly string[]).includes(g.intent);
  const retrievalScore = isRag && g.topSimilarity !== null ? Math.min(1, g.topSimilarity / g.settings.minSimilarity) : 0;

  const checks: GateDecision['checks'] = [
    { id: 'intent_allowed', passed: (AUTOSEND_INTENTS as readonly string[]).includes(g.intent), detail: g.intent },
    { id: 'no_risk_flags', passed: g.riskFlags.length === 0, detail: g.riskFlags.join(', ') || undefined },
    { id: 'sentiment_ok', passed: g.sentiment === 'positive' || g.sentiment === 'neutral', detail: g.sentiment },
    { id: 'urgency_ok', passed: g.urgency !== 'high', detail: g.urgency },
    isRag
      ? {
          id: 'retrieval_strong',
          passed: g.topSimilarity !== null && g.topSimilarity >= g.settings.minSimilarity,
          detail: `top ${g.topSimilarity?.toFixed(3) ?? 'none'} vs min ${g.settings.minSimilarity}`,
        }
      : g.intent === 'order_status'
        ? { id: 'retrieval_strong', passed: g.orderVerified, detail: g.orderVerified ? 'order verified' : 'order not verified' }
        : { id: 'retrieval_strong', passed: false, detail: 'not applicable to intent' },
    { id: 'validator_passed', passed: g.validator?.passed === true, detail: g.validator?.violations.map((x) => x.code).join(', ') || undefined },
    { id: 'grounded', passed: g.groundedness?.verdict === 'supported', detail: g.groundedness?.verdict ?? 'not run' },
    { id: 'no_human_request', passed: g.needsHumanBecause === null, detail: g.needsHumanBecause ?? undefined },
    {
      id: 'thread_cap',
      passed: g.autoRepliesInThread24h < g.settings.maxAutoRepliesPerThreadPerDay,
      detail: `${g.autoRepliesInThread24h}/${g.settings.maxAutoRepliesPerThreadPerDay}`,
    },
    { id: 'primary_model', passed: g.draftTier === 'primary', detail: g.draftTier ?? 'no draft' },
    { id: 'customer_ok', passed: !g.customerBlocked },
  ];

  const wouldAutosend = checks.every((c) => c.passed);
  const autosend =
    wouldAutosend &&
    g.settings.autosendEnabled &&
    (g.settings.autosendIntents as readonly string[]).includes(g.intent) &&
    !g.isDemo;
  const score = Math.min(...checks.map((c) => (c.id === 'retrieval_strong' && isRag ? retrievalScore : c.passed ? 1 : 0)));

  return { wouldAutosend, autosend, checks, score };
}
