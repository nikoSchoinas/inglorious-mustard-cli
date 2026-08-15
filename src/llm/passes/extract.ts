import type { LanguageModel } from 'ai';
import { DomainExtraction } from '../../schemas/extraction.js';
import type { MustardSession } from '../../schemas/session.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { extractPrompt } from '../prompts/extract.js';
import { phaseStateOf } from './input.js';

/**
 * The Phase 2 EXTRACT pass (spec §8.5 step 2). Unlike the generic ANALYSE/SYNTHESISE
 * passes it is not a `runPhase` pass: it is owned by the `runPhase2A` orchestrator,
 * so its signature takes the session directly (the phase is always 2). It projects
 * the raw-capture answer into a deterministic input and asks the FAST model for a
 * typed `DomainExtraction`.
 *
 * Returns the client's `LlmOutcome` verbatim: the orchestrator treats a `degraded`
 * extraction as an empty domain the user can build by hand, and a hard network
 * failure throws out of the client so every answer is preserved (§9.8).
 */
export type ExtractFn = (session: MustardSession) => Promise<LlmOutcome<DomainExtraction>>;

export interface ExtractDeps {
  client: LLMClient;
  /** The LLM model handle. */
  model: LanguageModel;
}

/** The raw-capture question id (bank/phase-2.ts). */
export const CAPTURE_QUESTION_ID = 'p2.capture';

export function createExtract(deps: ExtractDeps): ExtractFn {
  return async (session) => {
    const ps = phaseStateOf(session, 2);
    const capture = ps.answers.find((a) => a.questionId === CAPTURE_QUESTION_ID)?.value ?? '';
    const description = String(capture);
    const input = { phase: 2, literacy: session.literacy, description };

    return deps.client.generate({
      pass: 'extract',
      tier: 'fast',
      system: extractPrompt,
      input,
      prompt: `Extract the domain model from this description:\n\n${description}`,
      schema: DomainExtraction,
      model: deps.model,
    });
  };
}
