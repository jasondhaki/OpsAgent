import { z } from 'zod';
import { Constants } from './database.types';

// Enums come from generated DB constants — never hand-copied (CLAUDE.md rule 11).
const E = Constants.public.Enums;
export const INTENTS = E.ticket_intent;
export const AUTOSEND_INTENTS = ['product_question', 'shipping_payment', 'order_status'] as const satisfies readonly (typeof INTENTS)[number][];

const Language = z.enum(['bn', 'en', 'mixed']);

export const OrgSettings = z.object({
  autosendEnabled: z.boolean().default(false),
  autosendIntents: z.array(z.enum(AUTOSEND_INTENTS)).default([]),
  minSimilarity: z.number().min(0).max(1).default(0.75), // calibrate with evals
  maxAutoRepliesPerThreadPerDay: z.number().int().default(1),
  replyLanguage: z.enum(['mirror', 'bn', 'en']).default('mirror'),
  signature: z.string().default('— {{BUSINESS_NAME}}'),
  storefrontUrl: z.url().nullable().default(null),
  bookingUrl: z.url().nullable().default(null),
  allowedUrls: z.array(z.url()).default([]),
  telegramChatIds: z.array(z.string()).default([]),
  reminderAfterMinutes: z.number().int().default(120),
});
export type OrgSettings = z.infer<typeof OrgSettings>;

export const Classification = z.object({
  intent: z.enum(INTENTS),
  urgency: z.enum(E.urgency_level),
  sentiment: z.enum(E.sentiment_level),
  language: Language,
  orderRef: z.string().max(40).nullable(),
  productMentions: z.array(z.string().max(80)).max(5),
  lead: z
    .object({
      quantity: z.number().int().positive().nullable(),
      deadline: z.string().max(60).nullable(),
      customization: z.string().max(300).nullable(),
      budgetMentioned: z.boolean(),
      organizationType: z.enum(['individual', 'business', 'ngo', 'event', 'unknown']),
    })
    .nullable(),
  riskFlags: z
    .array(
      z.enum([
        'refund_request', 'damaged_item', 'legal_threat', 'payment_dispute',
        'prompt_injection_suspected', 'abusive', 'personal_data_shared', 'other_sensitive',
      ]),
    )
    .max(8),
  reasoning: z.string().max(300),
});
// NOTE: no requiresHumanReview and no confidence field. Both are computed by code.
export type Classification = z.infer<typeof Classification>;

export const DraftOutput = z.object({
  reply: z.string().min(1).max(2000),
  citedChunkIds: z.array(z.uuid()).max(8),
  language: Language,
  needsHumanBecause: z.string().max(200).nullable(),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

export const GroundednessReport = z.object({
  verdict: z.enum(['supported', 'partially_supported', 'unsupported']),
  unsupportedClaims: z.array(z.string().max(200)).max(10),
});
export type GroundednessReport = z.infer<typeof GroundednessReport>;

export const ValidatorReport = z.object({
  passed: z.boolean(),
  violations: z.array(z.object({ code: z.string(), detail: z.string() })),
});
export type ValidatorReport = z.infer<typeof ValidatorReport>;

export const GateDecision = z.object({
  wouldAutosend: z.boolean(),
  autosend: z.boolean(), // wouldAutosend && org.autosendEnabled && intent allowed && !demo
  checks: z.array(z.object({ id: z.string(), passed: z.boolean(), detail: z.string().optional() })),
  score: z.number().min(0).max(1), // display only
});
export type GateDecision = z.infer<typeof GateDecision>;

export const IngestPayload = z.object({
  gmailMessageId: z.string(),
  gmailThreadId: z.string(),
  rfcMessageId: z.string().max(998),
  from: z.string().max(320),
  to: z.string().max(2000),
  subject: z.string().max(998),
  date: z.string(), // ISO
  plainBody: z.string().max(50_000),
  headers: z.record(z.string(), z.string().max(2000)),
});
export type IngestPayload = z.infer<typeof IngestPayload>;
