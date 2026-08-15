import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { MustardSession } from '../../schemas/session.js';
import type { StackDecision } from '../../schemas/stack.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { explainStackPrompt } from '../prompts/explain-stack.js';
import { CAPTURE_QUESTION_ID } from './extract.js';
import { phaseStateOf } from './input.js';

/**
 * The Phase 4 "explain more" pass (spec §8.7). When the user asks for more on a
 * proposed decision at the review gate, this call returns a short plain-language
 * elaboration. The orchestrator notes it and re-asks the SAME decision.
 *
 * The output is a local `{ explanation }` object, so the pass owns its own fixture
 * key and the frozen schemas are untouched.
 */
export const StackExplanation = z.object({ explanation: z.string() });
export type StackExplanation = z.infer<typeof StackExplanation>;

export type ExplainStackFn = (
  session: MustardSession,
  decision: StackDecision,
) => Promise<LlmOutcome<StackExplanation>>;

export interface ExplainStackDeps {
  client: LLMClient;
  /** The LLM model handle. */
  model: LanguageModel;
}

export function createExplainStack(deps: ExplainStackDeps): ExplainStackFn {
  return async (session, decision) => {
    const capture = phaseStateOf(session, 2).answers.find(
      (a) => a.questionId === CAPTURE_QUESTION_ID,
    )?.value;

    const input = {
      phase: 4,
      literacy: session.literacy,
      product: String(capture ?? ''),
      decision: {
        category: decision.category,
        choice: decision.choice,
        justification: decision.justification,
        alternatives: decision.alternatives,
      },
    };

    return deps.client.generate({
      pass: 'explain-stack',
      tier: 'deep',
      system: explainStackPrompt,
      input,
      prompt: `Explain the "${decision.choice}" choice for the ${decision.category} in this product:\n\n${JSON.stringify(input, null, 2)}`,
      schema: StackExplanation,
      model: deps.model,
    });
  };
}
