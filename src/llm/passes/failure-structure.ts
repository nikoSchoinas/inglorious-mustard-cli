import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { MustardSession } from '../../schemas/session.js';
import type { UseCase } from '../../schemas/use-case.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { failureStructurePrompt } from '../prompts/failure-structure.js';

/**
 * A structured failure path, mirroring the frozen `UseCase.failurePaths` element
 * shape (schemas/use-case.ts). Local to this pass so it owns its own fixture key and
 * the frozen `UseCase` schema is untouched; the orchestrator copies these into the
 * use case.
 */
export const FailurePath = z.object({
  trigger: z.string(),
  systemResponse: z.string(),
  userVisible: z.string(),
});
export type FailurePath = z.infer<typeof FailurePath>;

export const FailurePaths = z.array(FailurePath);

/** One answered failure question fed into the structuring pass. */
export interface FailureAnswer {
  trigger: string;
  question: string;
  answer: string;
}

export type FailureStructureFn = (
  session: MustardSession,
  useCase: UseCase,
  answers: readonly FailureAnswer[],
) => Promise<LlmOutcome<FailurePath[]>>;

export interface FailureStructureDeps {
  client: LLMClient;
  /** The fast-tier model handle. */
  model: LanguageModel;
}

export function createFailureStructure(deps: FailureStructureDeps): FailureStructureFn {
  return async (session, useCase, answers) => {
    const input = {
      phase: 2,
      literacy: session.literacy,
      useCase: { title: useCase.title },
      items: answers.map((a) => ({ trigger: a.trigger, question: a.question, answer: a.answer })),
    };

    return deps.client.generate({
      pass: 'failure-structure',
      tier: 'fast',
      system: failureStructurePrompt,
      input,
      prompt: `Structure these answered failure questions for "${useCase.title}" into failure paths:\n\n${JSON.stringify(input.items, null, 2)}`,
      schema: FailurePaths,
      model: deps.model,
    });
  };
}
