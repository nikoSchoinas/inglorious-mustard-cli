import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { computeFixtureKey, schemaHash } from '../../src/llm/fixtures.js';
import {
  FakeTransport,
  FixtureCacheMissError,
  type LLMTransport,
  RecordTransport,
  ReplayTransport,
  type TransportRequest,
  modeFromEnv,
} from '../../src/llm/transport.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mustard-fixtures-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const schema = z.object({ a: z.string() });

function req(
  overrides: Partial<TransportRequest<{ a: string }>> = {},
): TransportRequest<{ a: string }> {
  return {
    pass: 'analyse',
    promptVersion: '1',
    model: {} as never, // ignored by record(inner)/replay
    system: 'system',
    prompt: 'prompt',
    input: { question: 'q1' },
    schema,
    ...overrides,
  };
}

describe('schemaHash / computeFixtureKey', () => {
  it('is stable for the same schema and changes when the schema changes', () => {
    const a = schemaHash(z.object({ a: z.string() }));
    const b = schemaHash(z.object({ a: z.string() }));
    const c = schemaHash(z.object({ a: z.string(), b: z.number() }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('inputHash ignores key order but tracks value changes', () => {
    const k1 = computeFixtureKey({ pass: 'p', promptVersion: '1', schema, input: { a: 1, b: 2 } });
    const k2 = computeFixtureKey({ pass: 'p', promptVersion: '1', schema, input: { b: 2, a: 1 } });
    const k3 = computeFixtureKey({ pass: 'p', promptVersion: '1', schema, input: { a: 9, b: 2 } });
    expect(k1.inputHash).toBe(k2.inputHash);
    expect(k1.inputHash).not.toBe(k3.inputHash);
  });
});

describe('record → replay round trip', () => {
  it('records a live result and replays it with zero calls to the inner transport', async () => {
    const inner = new FakeTransport([{ kind: 'object', value: { a: 'hello' } }]);
    const recorder = new RecordTransport(inner, root);
    const recorded = await recorder.generate(req());
    expect(recorded.object).toEqual({ a: 'hello' });
    expect(inner.calls).toHaveLength(1);

    const replay = new ReplayTransport(root);
    const replayed = await replay.generate(req());
    expect(replayed.object).toEqual({ a: 'hello' });
  });
});

describe('replay invalidation (the loud cache-miss guarantee)', () => {
  async function record(): Promise<void> {
    const inner = new FakeTransport([{ kind: 'object', value: { a: 'hello' } }]);
    await new RecordTransport(inner, root).generate(req());
  }

  it('throws on a promptVersion change', async () => {
    await record();
    const replay = new ReplayTransport(root);
    await expect(replay.generate(req({ promptVersion: '2' }))).rejects.toBeInstanceOf(
      FixtureCacheMissError,
    );
  });

  it('throws on an input change', async () => {
    await record();
    const replay = new ReplayTransport(root);
    await expect(replay.generate(req({ input: { question: 'different' } }))).rejects.toBeInstanceOf(
      FixtureCacheMissError,
    );
  });

  it('throws on a schema change', async () => {
    await record();
    const replay = new ReplayTransport(root);
    const widened = z.object({ a: z.string(), b: z.number() });
    await expect(replay.generate(req({ schema: widened as never }))).rejects.toBeInstanceOf(
      FixtureCacheMissError,
    );
  });
});

describe('modeFromEnv', () => {
  it('reads the mode and defaults to real', () => {
    expect(modeFromEnv({ MUSTARD_LLM_MODE: 'replay' })).toBe('replay');
    expect(modeFromEnv({ MUSTARD_LLM_MODE: 'record' })).toBe('record');
    expect(modeFromEnv({})).toBe('real');
    expect(modeFromEnv({ MUSTARD_LLM_MODE: 'nonsense' })).toBe('real');
  });
});

describe('FakeTransport', () => {
  it('validates a scripted object against the schema like the real transport', async () => {
    const fake: LLMTransport = new FakeTransport([{ kind: 'object', value: { a: 123 } }]);
    await expect(fake.generate(req())).rejects.toBeInstanceOf(z.ZodError);
  });
});
