import type { AnalyseFn, SynthesiseFn } from '../../engine/runner.js';
import type { MustardConfig } from '../../schemas/config.js';
import { readVersion } from '../../version.js';
import { LLMClient, type LLMClientOptions } from '../client.js';
import { createModelForTier } from '../router.js';
import { type LLMTransport, createTransport, modeFromEnv } from '../transport.js';
import { createAnalyse } from './analyse.js';
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
}

export function buildPasses(config: MustardConfig, opts: BuildPassesOptions = {}): Passes {
  const transport = opts.transport ?? createTransport(modeFromEnv());
  const client = opts.client ?? new LLMClient({ transport, ...opts.clientOptions });

  const fastModel = createModelForTier(config, 'fast', { apiKey: opts.apiKey });
  const deepModel = createModelForTier(config, 'deep', { apiKey: opts.apiKey });

  return {
    analyse: createAnalyse({ client, model: fastModel }),
    synthesise: createSynthesise({
      client,
      model: deepModel,
      mustardVersion: opts.mustardVersion ?? readVersion(),
      now: opts.now ?? (() => new Date().toISOString()),
    }),
  };
}
