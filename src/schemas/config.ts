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
  maxSessionUsd: z.number().positive().default(5),
  telemetry: z.boolean().default(false), // opt-in, off by default (§12)
});
export type MustardConfig = z.infer<typeof MustardConfig>;
