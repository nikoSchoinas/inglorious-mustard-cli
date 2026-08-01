import type { LanguageModel } from 'ai';
import { Architecture } from '../../schemas/architecture.js';
import { Phase2Output } from '../../schemas/phase2-output.js';
import { Phase3Output } from '../../schemas/schema-model.js';
import type { MustardSession } from '../../schemas/session.js';
import { Phase4Output } from '../../schemas/stack.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { synthesiseArchitecturePrompt } from '../prompts/synthesise-architecture.js';
import { phaseStateOf } from './input.js';

/**
 * The Phase 5 SYNTHESISE-ARCHITECTURE pass (spec §8.8). One deep-tier call reads
 * the derived facts and the typed outputs of Phases 2–4 and returns the whole
 * `Architecture`: component graph, sequence-diagram selections, ADR log, and the
 * three irreversible decisions. The orchestrator (`runPhase5`) then resolves the
 * selected use cases, runs the irreversibility gate, and renders the artifacts.
 *
 * The output schema is the strict `Architecture` (its shape + prompt version flow
 * into the fixture key); the input is a stable projection of the session (no
 * timestamps/ordering) so record and replay compute one fixture key.
 */
export type SynthesiseArchitectureFn = (
  session: MustardSession,
) => Promise<LlmOutcome<Architecture>>;

export interface SynthesiseArchitectureDeps {
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

export function createSynthesiseArchitecture(
  deps: SynthesiseArchitectureDeps,
): SynthesiseArchitectureFn {
  return async (session) => {
    const phase2 = Phase2Output.parse(phaseStateOf(session, 2).synthesisedObject);
    const phase3 = Phase3Output.parse(phaseStateOf(session, 3).synthesisedObject);
    const phase4 = Phase4Output.parse(phaseStateOf(session, 4).synthesisedObject);

    // Only the seed/follow-up answers ground the pass — the derived markers
    // (SYNTHESISE etc.) are noise and must not enter the stable input.
    const ps5 = phaseStateOf(session, 5);
    const answers = ps5.answers
      .filter((a) => a.source === 'seed' || a.source === 'followup')
      .map((a) => ({ id: a.questionId, value: a.value }));

    const input = {
      phase: 5,
      literacy: session.literacy,
      arch: factsUnder(session, 'arch.'),
      needs: factsUnder(session, 'needs.'),
      context: factsUnder(session, 'context.'),
      stack: phase4.decisions.map((d) => ({
        componentId: d.componentId,
        category: d.category,
        choice: d.choice,
      })),
      models: phase3.models.map((m) => ({ name: m.name, description: m.description })),
      // `failurePathCount` is pre-computed so the model's risk ranking is anchored
      // to real data rather than re-counted by the LLM.
      useCases: phase2.useCases.map((uc) => ({
        id: uc.id,
        title: uc.title,
        failurePathCount: uc.failurePaths.length,
        actors: [...new Set(uc.happyPath.map((s) => s.actor))],
        dependsOn: uc.dependsOn,
      })),
      answers,
    };

    return deps.client.generate({
      pass: 'synthesise-architecture',
      tier: 'deep',
      system: synthesiseArchitecturePrompt,
      input,
      prompt: `Design the architecture for this product from its stack, models and use cases:\n\n${JSON.stringify(input, null, 2)}`,
      schema: Architecture,
      model: deps.model,
    });
  };
}
