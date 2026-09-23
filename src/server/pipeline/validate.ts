import 'server-only';
import type { ValidatorReport } from '@/lib/contracts';
import { findPlaceholders } from '@/lib/placeholders';
import { bnDigitsToAscii } from './normalize';

export const RAG_INTENTS = ['product_question', 'shipping_payment'] as const;
export const MAX_REPLY_CHARS = 1200;

export type ValidateInput = {
  reply: string;
  intent: string;
  expectedLanguage: 'bn' | 'en';
  context: string; // all retrieved chunk text + structured facts, joined
  citedChunkIds: string[];
  retrievedChunkIds: string[];
  allowedUrls: string[];
};

// Commitment language. Allowed only if the same phrase appears in the context.
const COMMITMENT_RES: RegExp[] = [
  /\bguarantee[ds]?\b/gi,
  /\b(refund|exchange|replacement)\s+(is|has been|was)\s+approved\b/gi,
  /\bwe (will|'ll) (refund|replace|exchange)\b/gi,
  /\b\d+\s*%\s*(off|discount)\b/gi,
  /\bdiscount\b/gi,
  /\bfree (delivery|shipping)\b/gi,
  /\b(will|should) (reach|arrive|be delivered)( to you)? (by|on|tomorrow|today)\b/gi,
  /\bwithin \d+ (hours?|days?|weeks?)\b/gi,
  /\b(by|on) (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/gi,
  /\b\d{1,2}(st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi,
  /(গ্যারান্টি|নিশ্চিতভাবে|ফ্রি ডেলিভারি|ডিসকাউন্ট|ছাড় দে|টাকা ফেরত দেওয়া হবে|কালকের মধ্যে|আগামীকাল)/g,
];

const LEAK_RES: RegExp[] = [/\[(EMAIL|PHONE|ID|ORDER_REF)\]/, /<\/?customer_message/i, /system prompt/i, /\bas an ai\b/i];

const URL_RE = /\bhttps?:\/\/[^\s)<>\]"']+|\bwww\.[^\s)<>\]"']+/gi;
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

function banglaRatio(s: string): number {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[ঀ-৿]/.test(c)).length / letters.length;
}

const numbersIn = (s: string) => new Set((bnDigitsToAscii(s).match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, '')));

/** Deterministic draft checks. No LLM. Every violation blocks auto-send. */
export function validateDraft(input: ValidateInput): ValidatorReport {
  const v: ValidatorReport['violations'] = [];
  const { reply } = input;
  const ctx = bnDigitsToAscii(input.context).toLowerCase();

  const allowedNums = numbersIn(input.context);
  for (const n of numbersIn(reply)) {
    if (!allowedNums.has(n)) v.push({ code: 'UNSUPPORTED_NUMBER', detail: n });
  }

  for (const url of reply.match(URL_RE) ?? []) {
    const clean = url.replace(/[.,;:!?]+$/, '');
    if (!input.allowedUrls.some((a) => clean === a || clean.startsWith(a.endsWith('/') ? a : `${a}/`))) {
      v.push({ code: 'DISALLOWED_URL', detail: clean });
    }
  }

  const replyNorm = bnDigitsToAscii(reply);
  for (const re of COMMITMENT_RES) {
    for (const m of replyNorm.match(re) ?? []) {
      if (!ctx.includes(m.toLowerCase())) v.push({ code: 'COMMITMENT', detail: m });
    }
  }

  const ratio = banglaRatio(reply);
  if (input.expectedLanguage === 'bn' ? ratio < 0.4 : ratio > 0.1) {
    v.push({ code: 'LANGUAGE_MISMATCH', detail: `expected ${input.expectedLanguage}, bangla ratio ${ratio.toFixed(2)}` });
  }

  if (reply.length > MAX_REPLY_CHARS) v.push({ code: 'TOO_LONG', detail: `${reply.length} chars` });

  if ((RAG_INTENTS as readonly string[]).includes(input.intent) && input.citedChunkIds.length === 0) {
    v.push({ code: 'EMPTY_CITATIONS', detail: 'RAG reply cites no chunk' });
  }
  for (const id of input.citedChunkIds) {
    if (!input.retrievedChunkIds.includes(id)) v.push({ code: 'INVALID_CITATION', detail: id });
  }

  for (const re of LEAK_RES) {
    const m = re.exec(reply);
    if (m) v.push({ code: 'LEAKED_MARKER', detail: m[0] });
  }
  for (const p of findPlaceholders(reply)) v.push({ code: 'PLACEHOLDER_LEFT', detail: p });

  return { passed: v.length === 0, violations: v };
}
