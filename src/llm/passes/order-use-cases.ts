import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { MustardSession } from '../../schemas/session.js';
import type { UseCase } from '../../schemas/use-case.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { orderUseCasesPrompt } from '../prompts/order-use-cases.js';

/**
 * The dependency-ordering pass output (spec §8.5 step 7): use-case TITLES in build
 * order. Titles rather than ids keep the fixture readable and stable across id
 * allocation; the orchestrator maps them back to ids and validates the result is a
 * permutation of all use cases (`engine/phase-2b-order.ts`).
 */
export const UseCaseOrder = z.array(z.string());

export type OrderUseCasesFn = (
  session: MustardSession,
  useCases: readonly UseCase[],
) => Promise<LlmOutcome<string[]>>;

export interface OrderUseCasesDeps {
  client: LLMClient;
  /** The LLM model handle. */
  model: LanguageModel;
}

export function createOrderUseCases(deps: OrderUseCasesDeps): OrderUseCasesFn {
  return async (session, useCases) => {
    // Keyed by the use cases' stable content: title plus any declared dependencies.
    const input = {
      phase: 2,
      literacy: session.literacy,
      useCases: useCases.map((u) => ({ title: u.title, dependsOn: u.dependsOn })),
    };

    return deps.client.generate({
      pass: 'order-use-cases',
      tier: 'fast',
      system: orderUseCasesPrompt,
      input,
      prompt: `Put these use cases in build order (return the titles):\n\n${JSON.stringify(
        input.useCases.map((u) => u.title),
        null,
        2,
      )}`,
      schema: UseCaseOrder,
      model: deps.model,
    });
  };
}
