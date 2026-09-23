import 'server-only';
import type { Classification } from '@/lib/contracts';
import { bnDigitsToAscii } from './normalize';

export type RiskFlag = Classification['riskFlags'][number];

// Latin-script patterns (en + Banglish) use word boundaries; Bangla script has no \b, so plain substrings.
const RULES: { flag: RiskFlag; latin: RegExp; bangla: string[] }[] = [
  {
    flag: 'refund_request',
    latin: /\b(refund|money back|ferot|ferat|return (korte|dite|korbo)|taka (ferot|back))\b/i,
    bangla: ['ফেরত', 'রিফান্ড', 'রিটার্ন'],
  },
  {
    flag: 'damaged_item',
    latin: /\b(damaged?|broken|torn|ripped|defect(ive)?|faulty|wrong (item|product|bag|colou?r)|chh?era|fata|nosto|nashto|khara?p)\b/i,
    bangla: ['নষ্ট', 'ছেঁড়া', 'ছেড়া', 'ফাটা', 'ভুল পণ্য', 'ভুল ব্যাগ', 'খারাপ'],
  },
  {
    flag: 'legal_threat',
    latin: /\b(lawyer|legal action|court|sue|police|consumer rights?|case (korbo|dibo|korchi)|mamla|vokta odhikar)\b/i,
    bangla: ['আইনি', 'মামলা', 'উকিল', 'পুলিশ', 'ভোক্তা অধিকার'],
  },
  {
    flag: 'payment_dispute',
    latin: /\b(double (payment|charged?)|paid twice|charged twice|trx(id)?|transaction id|payment (failed|fail|hoy ?ni|hoy nai)|taka kete|kete niye(se|che))\b/i,
    bangla: ['টাকা কেটে', 'কেটে নিয়েছে', 'দুইবার', 'ট্রানজেকশন', 'পেমেন্ট হয়নি'],
  },
  {
    flag: 'prompt_injection_suspected',
    latin: /(ignore (all |any |the )?(previous|prior|above|earlier) (instructions?|rules|prompts?)|system prompt|you are now|developer mode|jailbreak|act as (an? )?(admin|system|developer)|<\/?customer_message|new instructions?:|disregard (the )?(rules|instructions))/i,
    bangla: ['আগের নির্দেশ', 'নির্দেশনা ভুলে', 'নিয়ম ভুলে'],
  },
  {
    flag: 'abusive',
    latin: /\b(idiot|stupid|scam(mer)?|fraud|cheat(er)?|batpar|chor|fuck\w*|shit|bastard|haramjada)\b/i,
    bangla: ['বাটপার', 'প্রতারক', 'চোর', 'হারামজাদা', 'ফাজিল'],
  },
  {
    // Custom/bulk/quantity/deadline language: never auto-answered (CLAUDE.md rule 5).
    flag: 'other_sensitive',
    latin: /(\b(bulk|wholesale|corporate|custom(i[sz]e|ised|ized)?|logo|reseller|\d{2,}\s*(pcs|pieces|pc|piece|ta|units?))\b|\b(deadline|urgent(ly)?|asap|by (tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|kal(ke)?r? moddhe)\b)/i,
    bangla: ['পাইকারি', 'কর্পোরেট', 'কাস্টম', 'লোগো', 'পিস', 'জরুরি', 'কালকের মধ্যে'],
  },
];

/** Deterministic risk flags from the (unredacted, normalised) customer text. Can only add caution. */
export function ruleFlags(text: string): RiskFlag[] {
  const s = bnDigitsToAscii(text);
  return RULES.filter((r) => r.latin.test(s) || r.bangla.some((w) => s.includes(w))).map((r) => r.flag);
}
