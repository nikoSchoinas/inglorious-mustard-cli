import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { MustardSession } from '../../schemas/session.js';
import type { UseCase } from '../../schemas/use-case.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { happyPathPrompt } from '../prompts/happy-path.js';
import { CAPTURE_QUESTION_ID } from './extract.js';
import { phaseStateOf } from './input.js';

/**
 * One happy-path step, mirroring the frozen `UseCase.happyPath` element shape
 * (schemas/use-case.ts). Kept local to this pass — as with `SuggestedCapability`,
 * a local output schema means the pass owns its own fixture key and the frozen
 * `UseCase` schema is untouched.
 */
export const HappyStep = z.object({
  actor: z.enum(['user', 'system', 'database', 'external']),
  action: z.string(),
});
export type HappyStep = z.infer<typeof HappyStep>;

export const HappyPath = z.array(HappyStep);

/** The actor a use case belongs to, projected to its stable identity for the input. */
export interface HappyPathActor {
  name: string;
  description: string;
}

export type HappyPathFn = (
  session: MustardSession,
  useCase: UseCase,
  actor: HappyPathActor,
) => Promise<LlmOutcome<HappyStep[]>>;

export interface HappyPathDeps {
  client: LLMClient;
  /** The LLM model handle. */
  model: LanguageModel;
}

export function createHappyPath(deps: HappyPathDeps): HappyPathFn {
  return async (session, useCase, actor) => {
    const ps = phaseStateOf(session, 2);
    const capture = ps.answers.find((a) => a.questionId === CAPTURE_QUESTION_ID)?.value ?? '';
    const description = String(capture);
    // Keyed by stable identity (actor name/description + use-case title), never a
    // minted id, so the fixture is stable regardless of id allocation.
    const input = {
      phase: 2,
      literacy: session.literacy,
      description,
      actor: { name: actor.name, description: actor.description },
      useCase: { title: useCase.title },
    };

    return deps.client.generate({
      pass: 'happy-path',
      tier: 'fast',
      system: happyPathPrompt,
      input,
      prompt: `Draft the happy path for "${useCase.title}" performed by ${actor.name} in this product:\n\n${description}`,
      schema: HappyPath,
      model: deps.model,
    });
  };
}
