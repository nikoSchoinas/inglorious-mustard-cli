import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';
import type { MustardConfig, Provider } from '../schemas/config.js';
import type { LlmTier } from './client.js';
import { bundledDefaults } from './manifest.js';

/**
 * Model resolution and the provider factory (spec §8.2 model routing, §9.5).
 * Every pass runs on the `deep` model — the fast tier was retired after quality
 * problems, though the tier machinery is kept so it can return as an opt-in.
 * Model IDs come from the user's config (seeded from the manifest at setup),
 * never hardcoded here — this file contains provider *wiring* only, no
 * model-name literals.
 */

/** The two model IDs for a config, falling back to the manifest if somehow blank. */
export function resolveModels(config: MustardConfig): Record<LlmTier, string> {
  const defaults = bundledDefaults(config.provider);
  return {
    fast: config.models.fast || defaults.fast,
    deep: config.models.deep || defaults.deep,
  };
}

/** The model ID for one tier. */
export function modelIdFor(config: MustardConfig, tier: LlmTier): string {
  return resolveModels(config)[tier];
}

export interface CreateModelOptions {
  apiKey?: string;
  /** Ollama base URL override (local, keyless). Defaults to the provider's own default. */
  baseURL?: string;
}

/**
 * Build an AI SDK `LanguageModel` handle for a provider + model ID. Constructing a
 * handle performs no network I/O — the call happens later, in the transport.
 */
export function createModel(
  provider: Provider,
  modelId: string,
  opts: CreateModelOptions = {},
): LanguageModel {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: opts.apiKey })(modelId);
    case 'openai':
      return createOpenAI({ apiKey: opts.apiKey })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: opts.apiKey })(modelId);
    case 'ollama':
      return createOllama(opts.baseURL ? { baseURL: opts.baseURL } : {})(modelId);
  }
}

/** Convenience: build the handle for a given tier straight from config. */
export function createModelForTier(
  config: MustardConfig,
  tier: LlmTier,
  opts: CreateModelOptions = {},
): LanguageModel {
  return createModel(config.provider, modelIdFor(config, tier), opts);
}
