import 'server-only';
import { GroundednessReport } from '@/lib/contracts';
import type { Llm, LlmResult } from '@/server/ai/providers';
import { GROUNDEDNESS_PROMPT_VERSION, GROUNDEDNESS_SYSTEM, groundednessPrompt } from '@/server/ai/prompts/groundedness.v1';

// Keep this many requests in reserve for classify/draft: groundedness is skipped (= failed) when quota is low.
const RESERVE = 50;

export function checkGroundedness(
  llm: Llm,
  i: { context: string; reply: string; orgId: string; ticketId: string },
): Promise<LlmResult<GroundednessReport>> {
  return llm.structured({
    step: 'groundedness',
    schema: GroundednessReport,
    system: GROUNDEDNESS_SYSTEM,
    prompt: groundednessPrompt(i),
    promptVersion: GROUNDEDNESS_PROMPT_VERSION,
    orgId: i.orgId,
    ticketId: i.ticketId,
    minRemaining: RESERVE,
  });
}
