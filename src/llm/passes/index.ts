import type { AnalyseFn, SynthesiseFn } from '../../engine/runner.js';
import { createRendererRegistry } from '../../render/register.js';
import type { RendererRegistry } from '../../render/registry.js';
import type { MustardConfig } from '../../schemas/config.js';
import { readVersion } from '../../version.js';
import { activityHook } from '../activity.js';
import { LLMClient, type LLMClientOptions } from '../client.js';
import { createModelForTier } from '../router.js';
import { type LLMTransport, createTransport, modeFromEnv } from '../transport.js';
import { createAnalyse } from './analyse.js';
import { type ExplainStackFn, createExplainStack } from './explain-stack.js';
import { type ExtractFn, createExtract } from './extract.js';
import { type FailureQuestionsFn, createFailureQuestions } from './failure-questions.js';
import { type FailureStructureFn, createFailureStructure } from './failure-structure.js';
import { type HappyPathFn, createHappyPath } from './happy-path.js';
import { type OrderUseCasesFn, createOrderUseCases } from './order-use-cases.js';
import { type ProposeEnumValuesFn, createProposeEnumValues } from './propose-enum-values.js';
import { type ProposeStackFn, createProposeStack } from './propose-stack.js';
import { type ProposeStructureFn, createProposeStructure } from './propose-structure.js';
import { type SequenceFn, createSequence } from './sequence.js';
import { type SuggestCapabilitiesFn, createSuggestCapabilities } from './suggest-capabilities.js';
import {
  type SynthesiseArchitectureFn,
  createSynthesiseArchitecture,
} from './synthesise-architecture.js';
import { createSynthesise } from './synthesise.js';

/**
 * The single seam that assembles the two runner passes from config (technical-plan
 * §4). Commands and the acceptance test call this and hand the result to
 * `runPhase`. The transport mode comes from `MUSTARD_LLM_MODE` (real / record /
 * replay), so the same wiring drives production, fixture recording, and offline
 * replay tests without change.
 */

export interface Passes {
  analyse: AnalyseFn;
  synthesise: SynthesiseFn;
  /** Phase 2 EXTRACT pass — owned by the `runPhase2A` orchestrator, not `runPhase`. */
  extract: ExtractFn;
  /** Phase 2 per-actor capability suggestion pass. */
  suggestCapabilities: SuggestCapabilitiesFn;
  /** Phase 2B per-use-case happy-path draft pass. */
  happyPath: HappyPathFn;
  /** Phase 2B per-use-case failure-question pass — the signature interrogation. */
  failureQuestions: FailureQuestionsFn;
  /** Phase 2B per-use-case failure-structuring pass. */
  failureStructure: FailureStructureFn;
  /** Phase 2B dependency-ordering pass. */
  orderUseCases: OrderUseCasesFn;
  /** Phase 3 per-enum-attribute value-proposal pass — owned by `runPhase3`. */
  proposeEnumValues: ProposeEnumValuesFn;
  /** Phase 4 stack-proposal pass — owned by `runPhase4`. */
  proposeStack: ProposeStackFn;
  /** Phase 4 "explain more" pass — owned by `runPhase4`. */
  explainStack: ExplainStackFn;
  /** Phase 4 folder-tree pass — owned by `runPhase4`. */
  proposeStructure: ProposeStructureFn;
  /** Phase 5 architecture-synthesis pass — owned by `runPhase5`. */
  synthesiseArchitecture: SynthesiseArchitectureFn;
  /** Phase 6 task-sequencing pass — owned by `runPhase6`. */
  sequence: SequenceFn;
}

export interface BuildPassesOptions {
  /** Resolved API key for the provider (undefined for keyless Ollama). */
  apiKey?: string;
  /** Override the transport (tests inject a fake or a fixed fixtures root). */
  transport?: LLMTransport;
  /** Override the client (tests inject fast backoff / no real waits). */
  client?: LLMClient;
  clientOptions?: Omit<LLMClientOptions, 'transport'>;
  /** ISO clock for artifact frontmatter. Defaults to wall clock. */
  now?: () => string;
  /** Package version for frontmatter. Defaults to the resolved runtime version. */
  mustardVersion?: string;
  /** Override the renderer registry (tests inject a stub). Defaults to production. */
  registry?: RendererRegistry;
}

export function buildPasses(config: MustardConfig, opts: BuildPassesOptions = {}): Passes {
  const mode = modeFromEnv();
  const transport = opts.transport ?? createTransport(mode);
  const client =
    opts.client ??
    new LLMClient({ transport, onActivityStart: activityHook(mode), ...opts.clientOptions });

  // Every pass runs on the deep model — the fast tier was retired after quality
  // problems. Each call declares `tier: 'deep'` so its timeout matches the model.
  const model = createModelForTier(config, 'deep', { apiKey: opts.apiKey });
  const registry = opts.registry ?? createRendererRegistry();

  return {
    analyse: createAnalyse({ client, model }),
    synthesise: createSynthesise({
      client,
      model,
      mustardVersion: opts.mustardVersion ?? readVersion(),
      now: opts.now ?? (() => new Date().toISOString()),
      registry,
    }),
    extract: createExtract({ client, model }),
    suggestCapabilities: createSuggestCapabilities({ client, model }),
    happyPath: createHappyPath({ client, model }),
    failureQuestions: createFailureQuestions({ client, model }),
    failureStructure: createFailureStructure({ client, model }),
    orderUseCases: createOrderUseCases({ client, model }),
    proposeEnumValues: createProposeEnumValues({ client, model }),
    proposeStack: createProposeStack({ client, model }),
    explainStack: createExplainStack({ client, model }),
    proposeStructure: createProposeStructure({ client, model }),
    synthesiseArchitecture: createSynthesiseArchitecture({ client, model }),
    sequence: createSequence({ client, model }),
  };
}
