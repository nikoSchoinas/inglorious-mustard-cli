import { type LanguageModel, generateObject } from 'ai';
import type { z } from 'zod';
import {
  type FixtureKey,
  computeFixtureKey,
  fixtureFilePath,
  readFixture,
  writeFixture,
} from './fixtures.js';

/**
 * The `LLMTransport` seam (technical-plan §2.3) — the one place a real provider
 * call happens, wrapped so it can be recorded and replayed. Three production
 * modes plus a test fake:
 *
 *   real   — call the provider via the AI SDK's `generateObject`.
 *   record — call real, then write the result to a fixture keyed by
 *            (pass, promptVersion, schemaHash, inputHash).
 *   replay — read the fixture; on a cache miss, throw loudly (never fall through
 *            to a live call). Zero tokens.
 *
 * Retry/timeout/degraded orchestration lives one layer up in `client.ts`; the
 * transport is a single attempt. Mode is selected by `MUSTARD_LLM_MODE`.
 */

export type LLMMode = 'real' | 'record' | 'replay';

export interface TransportRequest<T> {
  /** Fixture-key component: the pass name, e.g. `'analyse'`. */
  pass: string;
  /** Fixture-key component: the system prompt's version. */
  promptVersion: string;
  /** An AI SDK model handle built by `router.createModel`. Unused in replay. */
  model: LanguageModel;
  /** System message text. */
  system: string;
  /** Rendered user-prompt text actually sent to the model. */
  prompt: string;
  /** Structured pass input — hashed for the fixture key and stored for debugging. */
  input: unknown;
  /** The Zod output contract. `generateObject` validates against it. */
  schema: z.ZodType<T>;
  /** Client-managed timeout/cancellation. */
  abortSignal?: AbortSignal;
}

export interface TransportResult<T> {
  object: T;
}

export interface LLMTransport {
  generate<T>(req: TransportRequest<T>): Promise<TransportResult<T>>;
}

/** Thrown by the replay transport when no fixture exists for the computed key. */
export class FixtureCacheMissError extends Error {
  readonly key: FixtureKey;
  readonly path: string;
  constructor(key: FixtureKey, path: string) {
    super(
      `No LLM fixture for pass="${key.pass}" promptVersion="${key.promptVersion}" (schema/input drift?). Expected at ${path}. Re-record with MUSTARD_LLM_MODE=record.`,
    );
    this.name = 'FixtureCacheMissError';
    this.key = key;
    this.path = path;
  }
}

/** Live provider call via the AI SDK. */
export class RealTransport implements LLMTransport {
  async generate<T>(req: TransportRequest<T>): Promise<TransportResult<T>> {
    const { object } = await generateObject({
      model: req.model,
      system: req.system,
      prompt: req.prompt,
      schema: req.schema,
      abortSignal: req.abortSignal,
    });
    return { object };
  }
}

/** Live call + fixture write. Delegates the call to an inner transport (usually real). */
export class RecordTransport implements LLMTransport {
  constructor(
    private readonly inner: LLMTransport,
    private readonly root: string,
  ) {}

  async generate<T>(req: TransportRequest<T>): Promise<TransportResult<T>> {
    const result = await this.inner.generate(req);
    const key = computeFixtureKey({
      pass: req.pass,
      promptVersion: req.promptVersion,
      schema: req.schema,
      input: req.input,
    });
    writeFixture(this.root, key, req.input, result.object);
    return result;
  }
}

/** Fixture read only. Zero tokens; throws on cache miss. */
export class ReplayTransport implements LLMTransport {
  constructor(private readonly root: string) {}

  async generate<T>(req: TransportRequest<T>): Promise<TransportResult<T>> {
    const key = computeFixtureKey({
      pass: req.pass,
      promptVersion: req.promptVersion,
      schema: req.schema,
      input: req.input,
    });
    const fixture = readFixture(this.root, key);
    if (!fixture) {
      throw new FixtureCacheMissError(key, fixtureFilePath(this.root, key));
    }
    // Re-validate against the *current* schema so a stale-but-hash-colliding
    // fixture can't smuggle an invalid object through, and to recover the type.
    const object = req.schema.parse(fixture.response);
    return { object };
  }
}

/**
 * In-memory transport for unit tests (mirrors `ScriptedPrompter`). Each call
 * consumes the next scripted step: an object to return (validated like the real
 * transport) or an error to throw, letting the client's retry/degraded logic be
 * exercised deterministically without a key.
 */
export type FakeStep = { kind: 'object'; value: unknown } | { kind: 'error'; error: Error };

export class FakeTransport implements LLMTransport {
  readonly calls: TransportRequest<unknown>[] = [];
  private readonly steps: FakeStep[];

  constructor(steps: FakeStep[]) {
    this.steps = [...steps];
  }

  async generate<T>(req: TransportRequest<T>): Promise<TransportResult<T>> {
    this.calls.push(req as TransportRequest<unknown>);
    const step = this.steps.shift();
    if (!step) {
      throw new Error('FakeTransport: script exhausted');
    }
    if (step.kind === 'error') {
      throw step.error;
    }
    // Validate like the real transport, so a bad scripted object surfaces as a
    // schema failure exactly as a real provider would.
    const object = req.schema.parse(step.value);
    return { object };
  }
}

/** Read the transport mode from the environment, defaulting to `real`. */
export function modeFromEnv(env: NodeJS.ProcessEnv = process.env): LLMMode {
  const raw = env.MUSTARD_LLM_MODE;
  if (raw === 'record' || raw === 'replay' || raw === 'real') {
    return raw;
  }
  return 'real';
}
