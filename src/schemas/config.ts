import { z } from 'zod';

/**
 * Provider configuration (`~/.mustard/config.json`, spec §9.5). Derived here as
 * a schema only — the file I/O (mode-0600 read/write, key resolution) lands in
 * M4's `commands/config.ts`.
 *
 * Model IDs are plain strings with per-provider defaults resolved at runtime,
 * never enum-constrained: model names churn and a hardcoded ID is a broken
 * install (§9.5).
 */
export const MustardConfig = z.object({
  provider: z.enum(['anthropic', 'openai', 'google', 'ollama']),
  models: z.object({
    fast: z.string().min(1),
    deep: z.string().min(1),
  }),
  apiKeySource: z.enum(['env', 'config', 'keyring']),
  // Present only when `apiKeySource === 'config'`: the key lives in the same
  // mode-0600 file (§9.5). For 'env' and 'keyring' the key is resolved elsewhere
  // and this stays undefined, so it never ends up on disk.
  apiKey: z.string().min(1).optional(),
  telemetry: z.boolean().default(false), // opt-in, off by default (§12)
});
export type MustardConfig = z.infer<typeof MustardConfig>;

/** The provider identifiers MUSTARD can drive as its own reasoning backend. */
export const Provider = MustardConfig.shape.provider;
export type Provider = z.infer<typeof Provider>;

/** Where an API key is read from, in precedence order (env → config → keyring). */
export type ApiKeySource = z.infer<typeof MustardConfig.shape.apiKeySource>;
