import type { LanguageModel } from 'ai';
import { Phase3Output } from '../../schemas/schema-model.js';
import type { MustardSession } from '../../schemas/session.js';
import { StackProposal } from '../../schemas/stack.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { proposeStackPrompt } from '../prompts/propose-stack.js';
import { CAPTURE_QUESTION_ID } from './extract.js';
import { phaseStateOf } from './input.js';

/**
 * The Phase 4 PROPOSE-STACK pass (spec §8.7). One deep-tier call turns the derived
 * `needs.*` facts and the four `context.*` answers into a full `StackProposal` —
 * every component the product implies, decided together so they stay consistent.
 * The orchestrator (`runPhase4`) reviews the returned decisions one at a time.
 *
 * The output schema is the frozen `StackProposal` (an array of `StackDecision`),
 * so the pass shares that contract; the input is a stable projection of the
 * session (no timestamps/ordering) so record and replay compute one fixture key.
 */
export type ProposeStackFn = (session: MustardSession) => Promise<LlmOutcome<StackProposal>>;

export interface ProposeStackDeps {
  client: LLMClient;
  /** The deep-tier model handle. */
  model: LanguageModel;
}

/** Facts under a dotted prefix, as a sorted `{ shortKey: value }` map (stable for hashing). */
function factsUnder(session: MustardSession, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(session.facts).sort()) {
    if (key.startsWith(prefix)) {
      out[key.slice(prefix.length)] = session.facts[key];
    }
  }
  return out;
}

export function createProposeStack(deps: ProposeStackDeps): ProposeStackFn {
  return async (session) => {
    const capture = phaseStateOf(session, 2).answers.find(
      (a) => a.questionId === CAPTURE_QUESTION_ID,
    )?.value;
    const models = Phase3Output.parse(phaseStateOf(session, 3).synthesisedObject).models;

    const input = {
      phase: 4,
      literacy: session.literacy,
      needs: factsUnder(session, 'needs.'),
      context: factsUnder(session, 'context.'),
      product: {
        description: String(capture ?? ''),
        models: models.map((m) => ({
          name: m.name,
          description: m.description,
          attributes: m.attributes.map((a) => ({ name: a.name, type: a.type })),
        })),
      },
    };

    return deps.client.generate({
      pass: 'propose-stack',
      tier: 'deep',
      system: proposeStackPrompt,
      input,
      prompt: `Propose the technology stack for this product, one decision per needed component:\n\n${JSON.stringify(input, null, 2)}`,
      schema: StackProposal,
      model: deps.model,
    });
  };
}
