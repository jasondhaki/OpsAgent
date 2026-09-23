import 'server-only';
import { Classification } from '@/lib/contracts';
import type { Llm, LlmResult } from '@/server/ai/providers';
import { CLASSIFY_PROMPT_VERSION, CLASSIFY_SYSTEM, classifyPrompt } from '@/server/ai/prompts/classify.v1';

export function classify(
  llm: Llm,
  i: { subject: string | null; redactedBody: string; orgId: string; ticketId: string },
): Promise<LlmResult<Classification>> {
  return llm.structured({
    step: 'classify',
    schema: Classification,
    system: CLASSIFY_SYSTEM,
    prompt: classifyPrompt(i),
    promptVersion: CLASSIFY_PROMPT_VERSION,
    orgId: i.orgId,
    ticketId: i.ticketId,
  });
}
