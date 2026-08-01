import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { MustardSession } from '../../schemas/session.js';
import type { UseCase } from '../../schemas/use-case.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { failureQuestionsPrompt } from '../prompts/failure-questions.js';
import { CAPTURE_QUESTION_ID } from './extract.js';
import { phaseStateOf } from './input.js';

/**
 * A single generated failure scenario (spec §8.5 step 6): a machine-usable
 * `trigger` label and the `question` put to the user in plain language. The user's
 * answer to each question is later structured into a `failurePath` by the
 * `failure-structure` pass.
 */
export const FailureQuestion = z.object({
  trigger: z.string(),
  question: z.string(),
});
export type FailureQuestion = z.infer<typeof FailureQuestion>;

export const FailureQuestions = z.array(FailureQuestion);

/** The actor a use case belongs to, projected to its stable identity for the input. */
export interface FailureQuestionsActor {
  name: string;
}

export type FailureQuestionsFn = (
  session: MustardSession,
  useCase: UseCase,
  actor: FailureQuestionsActor,
) => Promise<LlmOutcome<FailureQuestion[]>>;

export interface FailureQuestionsDeps {
  client: LLMClient;
  /** The fast-tier model handle. */
  model: LanguageModel;
}

export function createFailureQuestions(deps: FailureQuestionsDeps): FailureQuestionsFn {
  return async (session, useCase, actor) => {
    const ps = phaseStateOf(session, 2);
    const capture = ps.answers.find((a) => a.questionId === CAPTURE_QUESTION_ID)?.value ?? '';
    const description = String(capture);
    // Keyed by the use case's stable content (title + happy path) and the actor's
    // name — never a minted id.
    const input = {
      phase: 2,
      literacy: session.literacy,
      description,
      useCase: { title: useCase.title, actor: actor.name, happyPath: useCase.happyPath },
    };

    return deps.client.generate({
      pass: 'failure-questions',
      tier: 'fast',
      system: failureQuestionsPrompt,
      input,
      prompt: `Generate the failure questions for the use case "${useCase.title}". Its happy path is:\n\n${JSON.stringify(useCase.happyPath, null, 2)}`,
      schema: FailureQuestions,
      model: deps.model,
    });
  };
}
