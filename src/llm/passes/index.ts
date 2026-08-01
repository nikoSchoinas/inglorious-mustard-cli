import type { AnalyseFn, SynthesiseFn } from '../../engine/runner.js';
import { createRendererRegistry } from '../../render/register.js';
import type { RendererRegistry } from '../../render/registry.js';
import type { MustardConfig } from '../../schemas/config.js';
import { readVersion } from '../../version.js';
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
import { type SuggestCapabilitiesFn, createSuggestCapabilities } from './suggest-capabilities.js';
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
  /** Phase 2 EXTRACT pass (fast) — owned by the `runPhase2A` orchestrator, not `runPhase`. */
  extract: ExtractFn;
  /** Phase 2 per-actor capability suggestion pass (fast). */
  suggestCapabilities: SuggestCapabilitiesFn;
  /** Phase 2B per-use-case happy-path draft pass (fast). */
  happyPath: HappyPathFn;
  /** Phase 2B per-use-case failure-question pass (fast) — the signature interrogation. */
  failureQuestions: FailureQuestionsFn;
  /** Phase 2B per-use-case failure-structuring pass (fast). */
  failureStructure: FailureStructureFn;
  /** Phase 2B dependency-ordering pass (fast). */
  orderUseCases: OrderUseCasesFn;
  /** Phase 3 per-enum-attribute value-proposal pass (fast) — owned by `runPhase3`. */
  proposeEnumValues: ProposeEnumValuesFn;
  /** Phase 4 stack-proposal pass (deep) — owned by `runPhase4`. */
  proposeStack: ProposeStackFn;
  /** Phase 4 "explain more" pass (fast) — owned by `runPhase4`. */
  explainStack: ExplainStackFn;
  /** Phase 4 folder-tree pass (fast) — owned by `runPhase4`. */
  proposeStructure: ProposeStructureFn;
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
  const transport = opts.transport ?? createTransport(modeFromEnv());
  const client = opts.client ?? new LLMClient({ transport, ...opts.clientOptions });

  const fastModel = createModelForTier(config, 'fast', { apiKey: opts.apiKey });
  const deepModel = createModelForTier(config, 'deep', { apiKey: opts.apiKey });
  const registry = opts.registry ?? createRendererRegistry();

  return {
    analyse: createAnalyse({ client, model: fastModel }),
    synthesise: createSynthesise({
      client,
      model: deepModel,
      mustardVersion: opts.mustardVersion ?? readVersion(),
      now: opts.now ?? (() => new Date().toISOString()),
      registry,
    }),
    extract: createExtract({ client, model: fastModel }),
    suggestCapabilities: createSuggestCapabilities({ client, model: fastModel }),
    happyPath: createHappyPath({ client, model: fastModel }),
    failureQuestions: createFailureQuestions({ client, model: fastModel }),
    failureStructure: createFailureStructure({ client, model: fastModel }),
    orderUseCases: createOrderUseCases({ client, model: fastModel }),
    proposeEnumValues: createProposeEnumValues({ client, model: fastModel }),
    proposeStack: createProposeStack({ client, model: deepModel }),
    explainStack: createExplainStack({ client, model: fastModel }),
    proposeStructure: createProposeStructure({ client, model: fastModel }),
  };
}
