import { APICallError, type LanguageModel, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import type { SystemPrompt } from './prompts/types.js';
import type { LLMTransport } from './transport.js';

/**
 * The `generateObject` orchestration layer (spec §9.5, §9.8) over an injected
 * `LLMTransport`. It owns the two failure policies that the transport deliberately
 * does not:
 *
 *   • Schema-validation failure — retry once with the validation error appended to
 *     the prompt; if it still fails, return a `degraded` outcome so the caller can
 *     render the raw answers under the artifact's headings (never crash the run).
 *
 *   • Transient failure (network / 5xx / timeout) — retry with exponential backoff
 *     up to `transientRetries` times, then throw `LlmUnavailableError`. The runner
 *     catches it, persists every answer, prints a resumable message, and exits 1.
 *     Input is never lost to a network error.
 *
 * Timeouts are 60s (fast) / 120s (deep) per the tier. Backoff and sleep are
 * injectable so tests exercise the retry logic without real waits.
 */

export type LlmTier = 'fast' | 'deep';

export interface GenerateArgs<T> {
  /** Pass name — flows to the fixture key, e.g. `'analyse'`. */
  pass: string;
  tier: LlmTier;
  /** Versioned system prompt; its `version` flows to the fixture key. */
  system: SystemPrompt;
  /** Structured input — hashed for the fixture key. */
  input: unknown;
  /** Rendered user-prompt text sent to the model. */
  prompt: string;
  /** The Zod output contract. */
  schema: z.ZodType<T>;
  /** AI SDK model handle from `router.createModel`. */
  model: LanguageModel;
}

export type LlmOutcome<T> = { status: 'ok'; value: T } | { status: 'degraded'; reason: string };

/** Thrown when the model is unreachable after retries — the runner persists and exits 1. */
export class LlmUnavailableError extends Error {
  readonly attempts: number;
  constructor(message: string, options: { cause?: unknown; attempts: number }) {
    super(message, { cause: options.cause });
    this.name = 'LlmUnavailableError';
    this.attempts = options.attempts;
  }
}

const DEFAULT_TIMEOUTS: Record<LlmTier, number> = { fast: 60_000, deep: 120_000 };
const DEFAULT_TRANSIENT_RETRIES = 3;

export interface LLMClientOptions {
  transport: LLMTransport;
  timeouts?: Partial<Record<LlmTier, number>>;
  /** Additional attempts after the first for transient errors (default 3 → 4 total). */
  transientRetries?: number;
  /** Backoff duration in ms for retry `n` (1-based). Default exponential from 500ms. */
  backoff?: (attempt: number) => number;
  /** Injected for tests to avoid real waits. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type FailureKind = 'schema' | 'transient' | 'fatal';

export class LLMClient {
  private readonly transport: LLMTransport;
  private readonly timeouts: Record<LlmTier, number>;
  private readonly transientRetries: number;
  private readonly backoff: (attempt: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: LLMClientOptions) {
    this.transport = opts.transport;
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
    this.transientRetries = opts.transientRetries ?? DEFAULT_TRANSIENT_RETRIES;
    this.backoff = opts.backoff ?? ((n) => 500 * 2 ** (n - 1));
    this.sleep = opts.sleep ?? realSleep;
  }

  async generate<T>(args: GenerateArgs<T>): Promise<LlmOutcome<T>> {
    const timeoutMs = this.timeouts[args.tier];
    let prompt = args.prompt;
    let schemaRetried = false;
    let transientAttempt = 0;

    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const { object } = await this.transport.generate({
          pass: args.pass,
          promptVersion: args.system.version,
          model: args.model,
          system: args.system.text,
          prompt,
          input: args.input,
          schema: args.schema,
          abortSignal: controller.signal,
        });
        return { status: 'ok', value: object };
      } catch (err) {
        const kind = classify(err, controller.signal.aborted);

        if (kind === 'schema') {
          if (!schemaRetried) {
            // One corrective retry: show the model exactly what failed.
            schemaRetried = true;
            prompt = `${args.prompt}\n\nYour previous reply did not satisfy the required schema:\n${describeError(err)}\nReturn a value that satisfies the schema exactly.`;
            continue;
          }
          return { status: 'degraded', reason: describeError(err) };
        }

        if (kind === 'transient') {
          transientAttempt++;
          if (transientAttempt <= this.transientRetries) {
            await this.sleep(this.backoff(transientAttempt));
            continue;
          }
        }

        throw new LlmUnavailableError(
          `LLM call failed for pass "${args.pass}" after ${transientAttempt + 1} attempt(s).`,
          { cause: err, attempts: transientAttempt + 1 },
        );
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

/** Classify a thrown error to pick the recovery policy. */
function classify(err: unknown, aborted: boolean): FailureKind {
  if (isSchemaError(err)) {
    return 'schema';
  }
  if (aborted) {
    return 'transient'; // our own timeout
  }
  if (APICallError.isInstance(err)) {
    return err.isRetryable ? 'transient' : 'fatal';
  }
  if (isNetworkError(err)) {
    return 'transient';
  }
  return 'fatal';
}

function isSchemaError(err: unknown): boolean {
  if (NoObjectGeneratedError.isInstance(err)) {
    return true;
  }
  if (err instanceof z.ZodError) {
    return true;
  }
  return err instanceof Error && err.name === 'ZodError';
}

/** Fetch/socket-level failures the AI SDK surfaces as plain errors. */
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  if (err.name === 'AbortError' || err.name === 'TimeoutError') {
    return true;
  }
  const code = (err as { code?: string }).code;
  const NETWORK_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];
  if (code && NETWORK_CODES.includes(code)) {
    return true;
  }
  return /fetch failed|network|socket hang up/i.test(err.message);
}

function describeError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return JSON.stringify(err.issues, null, 2);
  }
  if (NoObjectGeneratedError.isInstance(err)) {
    const raw = err.text ? ` Raw text: ${err.text.slice(0, 500)}` : '';
    return `${err.message}.${raw}`;
  }
  return err instanceof Error ? err.message : String(err);
}
