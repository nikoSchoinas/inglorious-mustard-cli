import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { MustardSession } from '../../schemas/session.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { proposeEnumValuesPrompt } from '../prompts/propose-enum-values.js';
import { CAPTURE_QUESTION_ID } from './extract.js';
import { phaseStateOf } from './input.js';

/**
 * The Phase 3 enum-discovery pass (spec §8.6). The frozen `DomainExtraction` records
 * `isEnum: true` for an attribute but no values, so for each enum attribute this pass
 * proposes the likely allowed values; the orchestrator shows them as a multiselect the
 * user confirms and extends. Fast tier — this is a suggestion, refined by the user.
 *
 * The output is a local `z.array(z.string())`, so the pass owns its own fixture key and
 * the frozen schemas are untouched.
 */
export const EnumValues = z.array(z.string());

/** One enum attribute, projected to its stable identity for the input (no minted ids). */
export interface EnumAttributeContext {
  entityName: string;
  entityDescription: string;
  attributeName: string;
  attributeType: string;
}

export type ProposeEnumValuesFn = (
  session: MustardSession,
  attribute: EnumAttributeContext,
) => Promise<LlmOutcome<string[]>>;

export interface ProposeEnumValuesDeps {
  client: LLMClient;
  /** The LLM model handle. */
  model: LanguageModel;
}

export function createProposeEnumValues(deps: ProposeEnumValuesDeps): ProposeEnumValuesFn {
  return async (session, attribute) => {
    // The Phase 2 raw capture gives product context; read it as happy-path does.
    const capture = phaseStateOf(session, 2).answers.find(
      (a) => a.questionId === CAPTURE_QUESTION_ID,
    )?.value;
    const description = String(capture ?? '');

    // Keyed by stable identity (entity + attribute names), never a minted id.
    const input = {
      phase: 3,
      literacy: session.literacy,
      description,
      entity: { name: attribute.entityName, description: attribute.entityDescription },
      attribute: { name: attribute.attributeName, type: attribute.attributeType },
    };

    return deps.client.generate({
      pass: 'propose-enum-values',
      tier: 'fast',
      system: proposeEnumValuesPrompt,
      input,
      prompt: `Propose the allowed values for the "${attribute.attributeName}" of a ${attribute.entityName} in this product:\n\n${description}`,
      schema: EnumValues,
      model: deps.model,
    });
  };
}
