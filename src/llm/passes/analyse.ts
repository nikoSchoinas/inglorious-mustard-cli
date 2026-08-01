import type { LanguageModel } from 'ai';
import type { AnalyseFn } from '../../engine/runner.js';
import { PhaseAnalysis } from '../../schemas/analysis.js';
import type { LLMClient } from '../client.js';
import { analysePrompt } from '../prompts/analyse.js';
import { phaseStateOf, projectAnswers } from './input.js';

/**
 * The real ANALYSE pass (spec §8.2 step 2), wiring the versioned `analyse` system
 * prompt and the `PhaseAnalysis` contract through the `LLMClient`. Generic over any
 * phase: it projects the current phase's answers into a deterministic input and
 * asks the fast model to critique them.
 *
 * Returns the client's `LlmOutcome` verbatim — the runner treats a `degraded`
 * analysis as "nothing flagged, ready to synthesise" (runner.ts), and a hard
 * network failure throws out of the client so every answer is preserved (§9.8).
 */
export interface AnalyseDeps {
  client: LLMClient;
  /** The fast-tier model handle. */
  model: LanguageModel;
}

export function createAnalyse(deps: AnalyseDeps): AnalyseFn {
  return async (phase, session) => {
    const ps = phaseStateOf(session, phase.phase);
    const input = {
      phase: phase.phase,
      phaseName: phase.name,
      literacy: session.literacy,
      answers: projectAnswers(ps),
    };

    return deps.client.generate({
      pass: 'analyse',
      tier: 'fast',
      system: analysePrompt,
      input,
      prompt: `Analyse the answers for phase "${phase.name}":\n\n${JSON.stringify(input.answers, null, 2)}`,
      schema: PhaseAnalysis,
      model: deps.model,
    });
  };
}
