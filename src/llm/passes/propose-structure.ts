import type { LanguageModel } from 'ai';
import { Phase3Output } from '../../schemas/schema-model.js';
import type { MustardSession } from '../../schemas/session.js';
import type { StackDecision } from '../../schemas/stack.js';
import { FolderTree } from '../../schemas/structure.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { proposeStructurePrompt } from '../prompts/propose-structure.js';
import { phaseStateOf } from './input.js';

/**
 * The Phase 4 folder-tree pass (spec §3.2, §8.7): given the ACCEPTED
 * stack and the data models, propose an idiomatic starting `03-STRUCTURE.md` tree.
 * Runs after the decision loop, so the choices it sees are the user's final ones.
 *
 * Output schema is `FolderTree`; input is a stable projection (accepted choices +
 * model names) so record and replay compute one fixture key.
 */
export type ProposeStructureFn = (
  session: MustardSession,
  decisions: readonly StackDecision[],
) => Promise<LlmOutcome<FolderTree>>;

export interface ProposeStructureDeps {
  client: LLMClient;
  /** The LLM model handle. */
  model: LanguageModel;
}

export function createProposeStructure(deps: ProposeStructureDeps): ProposeStructureFn {
  return async (session, decisions) => {
    const models = Phase3Output.parse(phaseStateOf(session, 3).synthesisedObject).models;

    const input = {
      phase: 4,
      literacy: session.literacy,
      stack: decisions.map((d) => ({ category: d.category, choice: d.choice })),
      models: models.map((m) => m.name),
    };

    return deps.client.generate({
      pass: 'propose-structure',
      tier: 'deep',
      system: proposeStructurePrompt,
      input,
      prompt: `Propose the starting folder tree for a repository on this accepted stack:\n\n${JSON.stringify(input, null, 2)}`,
      schema: FolderTree,
      model: deps.model,
    });
  };
}
