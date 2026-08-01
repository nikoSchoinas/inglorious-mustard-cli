import type { ApiKeySource, MustardConfig, Provider } from '../schemas/config.js';
import { readKey } from './keyring.js';

/**
 * API-key resolution (spec §9.1, §9.5). The key is resolved by a fixed precedence
 * chain — environment variable → `config.json` → OS keyring — independent of the
 * `apiKeySource` recorded in config, which only reflects where the user chose to
 * store it during setup. Environment always wins so a shell export can override a
 * saved key without editing files.
 *
 * Ollama is local and keyless: it resolves to `{ source: 'none' }` and never
 * consults env/config/keyring.
 */

/** Conventional env var per provider — matches the AI SDK's own defaults. */
export const PROVIDER_ENV_VAR: Record<Provider, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  ollama: null, // local, no key
};

/** Whether a provider requires an API key at all. */
export function requiresKey(provider: Provider): boolean {
  return PROVIDER_ENV_VAR[provider] !== null;
}

export type ResolvedKey =
  | { key: string; source: ApiKeySource }
  | { key: null; source: 'none' } // keyless provider (ollama)
  | { key: null; source: 'missing' }; // key required but not found anywhere

export interface ResolveOptions {
  /** Injected for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve the API key for `config.provider`, trying env → config → keyring in
 * order. Returns the key and the source it came from, or a `none`/`missing`
 * marker. Never throws — callers decide how to surface a `missing` result.
 */
export async function resolveApiKey(
  config: MustardConfig,
  opts: ResolveOptions = {},
): Promise<ResolvedKey> {
  const provider = config.provider;
  if (!requiresKey(provider)) {
    return { key: null, source: 'none' };
  }

  const env = opts.env ?? process.env;
  const envVar = PROVIDER_ENV_VAR[provider];
  const fromEnv = envVar ? env[envVar]?.trim() : undefined;
  if (fromEnv) {
    return { key: fromEnv, source: 'env' };
  }

  const fromConfig = config.apiKey?.trim();
  if (fromConfig) {
    return { key: fromConfig, source: 'config' };
  }

  const fromKeyring = await readKey(provider);
  if (fromKeyring) {
    return { key: fromKeyring, source: 'keyring' };
  }

  return { key: null, source: 'missing' };
}
