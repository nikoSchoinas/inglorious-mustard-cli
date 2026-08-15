import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { DomainExtraction } from '../../schemas/extraction.js';
import type { MustardSession } from '../../schemas/session.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { suggestCapabilitiesPrompt } from '../prompts/suggest-capabilities.js';
import { CAPTURE_QUESTION_ID } from './extract.js';
import { phaseStateOf } from './input.js';

/** One confirmed actor, as carried by the reflection-corrected `DomainExtraction`. */
export type Actor = DomainExtraction['actors'][number];

/**
 * The LLM's per-actor suggestion shape: no id and no actorId — the orchestrator
 * mints ids and binds the actorId when it merges accepted suggestions into the
 * capability set (`mergeCapabilities`, engine/phase-2a-edit.ts). Keeping this local
 * (rather than reusing the frozen `DomainExtraction` capability object) means the
 * extract pass's fixture key is untouched by this pass.
 */
export const SuggestedCapability = z.object({
  verb: z.string(),
  object: z.string(),
  description: z.string(),
});
export type SuggestedCapability = z.infer<typeof SuggestedCapability>;

export const SuggestedCapabilities = z.array(SuggestedCapability);

export type SuggestCapabilitiesFn = (
  session: MustardSession,
  actor: Actor,
) => Promise<LlmOutcome<SuggestedCapability[]>>;

export interface SuggestCapabilitiesDeps {
  client: LLMClient;
  /** The LLM model handle. */
  model: LanguageModel;
}

export function createSuggestCapabilities(deps: SuggestCapabilitiesDeps): SuggestCapabilitiesFn {
  return async (session, actor) => {
    const ps = phaseStateOf(session, 2);
    const capture = ps.answers.find((a) => a.questionId === CAPTURE_QUESTION_ID)?.value ?? '';
    const description = String(capture);
    // Deterministic input, keyed by the actor's identity (name + description) rather
    // than its minted id, so the fixture is stable regardless of id allocation.
    const input = {
      phase: 2,
      literacy: session.literacy,
      description,
      actor: { name: actor.name, description: actor.description },
    };

    return deps.client.generate({
      pass: 'suggest-capabilities',
      tier: 'deep',
      system: suggestCapabilitiesPrompt,
      input,
      prompt: `Suggest capabilities for the actor "${actor.name}" (${actor.description}) in this product:\n\n${description}`,
      schema: SuggestedCapabilities,
      model: deps.model,
    });
  };
}
