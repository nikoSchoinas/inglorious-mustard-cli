import type { LanguageModel } from 'ai';
import { Phase5Output } from '../../schemas/architecture.js';
import { Phase2Output } from '../../schemas/phase2-output.js';
import { Sequence } from '../../schemas/roadmap.js';
import { Phase3Output } from '../../schemas/schema-model.js';
import type { MustardSession } from '../../schemas/session.js';
import { Phase4Output } from '../../schemas/stack.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { sequencePrompt } from '../prompts/sequence.js';
import { phaseStateOf } from './input.js';

/**
 * The Phase 6 SEQUENCE pass (spec §8.9). One deep-tier call reads the accepted
 * outputs of Phases 2–5 and the two Phase 6 answers and returns the tasks — sized
 * to fit one agent prompt each, grouped, with `dependsOn` edges. The orchestrator
 * (`runPhase6`) then owns the topology: it topologically sorts the tasks and
 * writes them to `session.tasks`.
 *
 * The output schema is the strict `Sequence` (its shape + prompt version flow into
 * the fixture key); the input is a stable projection of the session (no timestamps
 * or run-varying ordering) so record and replay compute one fixture key.
 */
export type SequenceFn = (session: MustardSession) => Promise<LlmOutcome<Sequence>>;

export interface SequenceDeps {
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

export function createSequence(deps: SequenceDeps): SequenceFn {
  return async (session) => {
    const phase2 = Phase2Output.parse(phaseStateOf(session, 2).synthesisedObject);
    const phase3 = Phase3Output.parse(phaseStateOf(session, 3).synthesisedObject);
    const phase4 = Phase4Output.parse(phaseStateOf(session, 4).synthesisedObject);
    const phase5 = Phase5Output.parse(phaseStateOf(session, 5).synthesisedObject);

    const input = {
      phase: 6,
      literacy: session.literacy,
      roadmap: factsUnder(session, 'roadmap.'),
      needs: factsUnder(session, 'needs.'),
      context: factsUnder(session, 'context.'),
      stack: phase4.decisions.map((d) => ({
        componentId: d.componentId,
        category: d.category,
        choice: d.choice,
      })),
      models: phase3.models.map((m) => ({ name: m.name, description: m.description })),
      components: phase5.componentGraph.components.map((c) => ({
        id: c.id,
        label: c.label,
        category: c.category,
      })),
      useCases: phase2.useCases.map((uc) => ({
        id: uc.id,
        title: uc.title,
        dependsOn: uc.dependsOn,
        failurePathCount: uc.failurePaths.length,
      })),
      // The confirmed build order from Phase 2 step 7 — the strongest ordering hint.
      dependencyOrder: phase2.dependencyOrder,
    };

    return deps.client.generate({
      pass: 'sequence',
      tier: 'deep',
      system: sequencePrompt,
      input,
      prompt: `Break this fully-specified product into agent-sized, dependency-ordered tasks:\n\n${JSON.stringify(input, null, 2)}`,
      schema: Sequence,
      model: deps.model,
    });
  };
}
