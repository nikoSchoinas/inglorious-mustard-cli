import { APICallError } from 'ai';
import { z } from 'zod';
import type { MustardConfig } from '../schemas/config.js';
import { activityHook } from './activity.js';
import { LLMClient, type LLMClientOptions, LlmUnavailableError } from './client.js';
import { connectivityPrompt } from './prompts/connectivity.js';
import { createModelForTier } from './router.js';
import type { LLMTransport } from './transport.js';

/**
 * Phase 0 connectivity check (spec §8.3 step 0.5, §9.8). Runs one cheap structured
 * call before any real question, so an invalid key or an unreachable provider fails
 * fast — up front — instead of mid-interrogation. Distinguishes an auth failure
 * (`invalid-key`) from a network/provider problem (`no-network`) so the CLI can
 * give the right advice.
 */

const ProbeSchema = z.object({ ok: z.boolean() });

export type ConnectivityResult =
  | { status: 'ok' }
  | { status: 'invalid-key'; detail: string }
  | { status: 'no-network'; detail: string };

export interface CheckConnectivityOptions {
  transport: LLMTransport;
  /** Injected into the client for tests (backoff/sleep/timeouts). */
  clientOptions?: Omit<LLMClientOptions, 'transport'>;
  apiKey?: string;
  baseURL?: string;
}

/** HTTP statuses that indicate a bad/expired key rather than a transient outage. */
function isAuthStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

export async function checkConnectivity(
  config: MustardConfig,
  opts: CheckConnectivityOptions,
): Promise<ConnectivityResult> {
  const client = new LLMClient({
    transport: opts.transport,
    onActivityStart: activityHook(),
    ...opts.clientOptions,
  });
  // The good (deep) model everywhere — even this cheap Phase 0 probe.
  const model = createModelForTier(config, 'deep', {
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
  });

  try {
    // A `degraded` outcome still means the provider answered, so we ignore the
    // returned value — reaching here at all proves connectivity.
    await client.generate({
      pass: 'connectivity',
      tier: 'fast',
      system: connectivityPrompt,
      input: { probe: true },
      prompt: 'Reply with {"ok": true}.',
      schema: ProbeSchema,
      model,
    });
    return { status: 'ok' };
  } catch (err) {
    const cause = err instanceof LlmUnavailableError ? err.cause : err;
    if (APICallError.isInstance(cause) && isAuthStatus(cause.statusCode)) {
      return { status: 'invalid-key', detail: cause.message };
    }
    return { status: 'no-network', detail: cause instanceof Error ? cause.message : String(cause) };
  }
}
