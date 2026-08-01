import { z } from 'zod';
import type { Provider } from '../schemas/config.js';

/**
 * Model defaults live here as *data*, never hardcoded in router/client logic
 * (spec §9.5, technical-plan pitfall 6). Model IDs churn every few months, so a
 * hardcoded ID in application code is a broken install. The router reads defaults
 * from this manifest; `mustard config` lets the user override any of them; and
 * `fetchRemoteManifest` can refresh the defaults from a small remote JSON with the
 * bundled copy as a guaranteed fallback.
 *
 * MUSTARD never asserts a model's availability or price — it points at the
 * provider's own docs (`docsUrl`) and lets the user confirm.
 */

export const ModelTierDefaults = z.object({
  /** Cheap/quick model for ANALYSE + extraction (§8.2). */
  fast: z.string().min(1),
  /** High-quality model for SYNTHESISE (§8.2). */
  deep: z.string().min(1),
});
export type ModelTierDefaults = z.infer<typeof ModelTierDefaults>;

export const ProviderManifestEntry = ModelTierDefaults.extend({
  docsUrl: z.string().url(),
});
export type ProviderManifestEntry = z.infer<typeof ProviderManifestEntry>;

export const ModelManifest = z.object({
  version: z.number().int(),
  providers: z.record(z.enum(['anthropic', 'openai', 'google', 'ollama']), ProviderManifestEntry),
});
export type ModelManifest = z.infer<typeof ModelManifest>;

/**
 * Bundled fallback. These are sensible starting points as of authoring, not
 * promises — every value is user-overridable via `mustard config` and refreshable
 * from the remote manifest. When in doubt, follow each provider's `docsUrl`.
 */
export const BUNDLED_MANIFEST: ModelManifest = {
  version: 1,
  providers: {
    anthropic: {
      fast: 'claude-haiku-4-5',
      deep: 'claude-sonnet-4-6',
      docsUrl: 'https://docs.claude.com/en/api/overview',
    },
    openai: {
      fast: 'gpt-4o-mini',
      deep: 'gpt-4o',
      docsUrl: 'https://platform.openai.com/docs/models',
    },
    google: {
      fast: 'gemini-2.0-flash',
      deep: 'gemini-2.5-pro',
      docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    },
    ollama: {
      fast: 'llama3.2',
      deep: 'llama3.1:70b',
      docsUrl: 'https://ollama.com/library',
    },
  },
};

/** Where `fetchRemoteManifest` looks unless overridden. Override via `MUSTARD_MANIFEST_URL`. */
export const DEFAULT_MANIFEST_URL =
  'https://raw.githubusercontent.com/nikoSchoinas/inglorious-mustard/main/models-manifest.json';

/** Per-provider default fast/deep IDs from the bundled manifest. */
export function bundledDefaults(provider: Provider): ModelTierDefaults {
  const entry = BUNDLED_MANIFEST.providers[provider];
  if (!entry) {
    // Unreachable given the Provider union, but keep it total rather than throwing.
    return { fast: '', deep: '' };
  }
  return { fast: entry.fast, deep: entry.deep };
}

/** The provider's documentation URL — surfaced to users instead of asserting availability. */
export function providerDocsUrl(provider: Provider): string {
  return BUNDLED_MANIFEST.providers[provider]?.docsUrl ?? '';
}

export interface FetchManifestOptions {
  url?: string;
  /** Injected for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Abort the request after this many ms (best-effort refresh, never blocks long). */
  timeoutMs?: number;
}

/**
 * Best-effort remote refresh. Returns the parsed remote manifest, or the bundled
 * one on any failure (network, timeout, malformed JSON, schema mismatch). Never
 * throws — a refresh failure must degrade to the bundled defaults, not break the
 * command.
 */
export async function fetchRemoteManifest(opts: FetchManifestOptions = {}): Promise<ModelManifest> {
  const url = opts.url ?? process.env.MUSTARD_MANIFEST_URL ?? DEFAULT_MANIFEST_URL;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 3000;
  if (!fetchImpl) {
    return BUNDLED_MANIFEST;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      return BUNDLED_MANIFEST;
    }
    const json = await res.json();
    const parsed = ModelManifest.safeParse(json);
    return parsed.success ? parsed.data : BUNDLED_MANIFEST;
  } catch {
    return BUNDLED_MANIFEST;
  } finally {
    clearTimeout(timer);
  }
}
