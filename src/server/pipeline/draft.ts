import 'server-only';
import { DraftOutput } from '@/lib/contracts';
import type { Llm, LlmResult } from '@/server/ai/providers';
import { DRAFT_PROMPT_VERSION, DRAFT_SYSTEM, draftPrompt, type DraftPromptInput } from '@/server/ai/prompts/draft.v1';

export { DRAFT_PROMPT_VERSION };

export function draftReply(llm: Llm, i: DraftPromptInput & { orgId: string; ticketId: string }): Promise<LlmResult<DraftOutput>> {
  return llm.structured({
    step: 'draft',
    schema: DraftOutput,
    system: DRAFT_SYSTEM,
    prompt: draftPrompt(i),
    promptVersion: DRAFT_PROMPT_VERSION,
    orgId: i.orgId,
    ticketId: i.ticketId,
  });
}
