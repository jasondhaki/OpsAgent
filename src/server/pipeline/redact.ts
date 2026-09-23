import 'server-only';
import { bnDigitsToAscii } from './normalize';

// Storefront order ref format. ponytail: fixed default; make it an org setting once the real storefront format is known.
export const DEFAULT_ORDER_REF_RE = /\b[A-Z]{2,4}-\d{4,8}\b/gi;

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const BD_PHONE_RE = /(?:\+?880[\s-]?|\b0)1[3-9](?:[\s-]?\d){8}\b/g;
const LONG_DIGITS_RE = /\b\d{9,}\b/g;
// bKash-style trx ids: 8–12 uppercase alphanumerics containing both letters and digits.
const TRX_RE = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b/g;

export type Redaction = {
  redacted: string;
  orderRefs: string[]; // raw refs, for the order adapter only
  found: { email: number; phone: number; id: number };
};

/** Remove PII before any LLM call. Works on a Bangla-digit-normalised copy so ০১৭… phones are caught. */
export function redact(text: string, orderRefRe: RegExp = DEFAULT_ORDER_REF_RE): Redaction {
  const found = { email: 0, phone: 0, id: 0 };
  const orderRefs: string[] = [];
  const s = bnDigitsToAscii(text)
    .replace(EMAIL_RE, () => (found.email++, '[EMAIL]'))
    .replace(orderRefRe, (m) => (orderRefs.push(m.toUpperCase()), '[ORDER_REF]'))
    .replace(BD_PHONE_RE, () => (found.phone++, '[PHONE]'))
    .replace(LONG_DIGITS_RE, () => (found.id++, '[ID]'))
    .replace(TRX_RE, () => (found.id++, '[ID]'));
  return { redacted: s, orderRefs: [...new Set(orderRefs)], found };
}
