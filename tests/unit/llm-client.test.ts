import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type GenerateArgs, LLMClient, LlmUnavailableError } from '../../src/llm/client.js';
import { FakeTransport, type LLMTransport } from '../../src/llm/transport.js';

const schema = z.object({ a: z.string() });
const system = { id: 'test', version: '1', text: 'system' };

function args(overrides: Partial<GenerateArgs<{ a: string }>> = {}): GenerateArgs<{ a: string }> {
  return {
    pass: 'analyse',
    tier: 'fast',
    system,
    input: { q: 1 },
    prompt: 'do the thing',
    schema,
    model: {} as never,
    ...overrides,
  };
}

// No real waits: backoff is zero and sleep is a no-op.
function client(transport: LLMTransport, transientRetries = 3): LLMClient {
  return new LLMClient({ transport, transientRetries, backoff: () => 0, sleep: async () => {} });
}

function retryableApiError(): APICallError {
  return new APICallError({
    message: 'server error',
    url: 'https://example.test',
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  });
}

function fatalApiError(): APICallError {
  return new APICallError({
    message: 'unauthorized',
    url: 'https://example.test',
    requestBodyValues: {},
    statusCode: 401,
    isRetryable: false,
  });
}

describe('LLMClient happy path', () => {
  it('returns ok with the validated object', async () => {
    const transport = new FakeTransport([{ kind: 'object', value: { a: 'x' } }]);
    const result = await client(transport).generate(args());
    expect(result).toEqual({ status: 'ok', value: { a: 'x' } });
    expect(transport.calls).toHaveLength(1);
  });
});

describe('schema-validation failure policy', () => {
  it('retries once with the validation error appended, then succeeds', async () => {
    const transport = new FakeTransport([
      { kind: 'error', error: new z.ZodError([]) },
      { kind: 'object', value: { a: 'recovered' } },
    ]);
    const result = await client(transport).generate(args());
    expect(result).toEqual({ status: 'ok', value: { a: 'recovered' } });
    expect(transport.calls).toHaveLength(2);
    // The corrective retry augments the prompt.
    expect(transport.calls[1]?.prompt).toContain('did not satisfy the required schema');
  });

  it('degrades after the single corrective retry still fails', async () => {
    const transport = new FakeTransport([
      { kind: 'error', error: new z.ZodError([]) },
      { kind: 'error', error: new z.ZodError([]) },
    ]);
    const result = await client(transport).generate(args());
    expect(result.status).toBe('degraded');
    expect(transport.calls).toHaveLength(2);
  });
});

describe('transient failure policy', () => {
  it('retries a retryable API error with backoff, then succeeds', async () => {
    const transport = new FakeTransport([
      { kind: 'error', error: retryableApiError() },
      { kind: 'object', value: { a: 'ok' } },
    ]);
    const result = await client(transport).generate(args());
    expect(result).toEqual({ status: 'ok', value: { a: 'ok' } });
    expect(transport.calls).toHaveLength(2);
  });

  it('throws LlmUnavailableError after exhausting transient retries', async () => {
    const transport = new FakeTransport([
      { kind: 'error', error: retryableApiError() },
      { kind: 'error', error: retryableApiError() },
      { kind: 'error', error: retryableApiError() },
    ]);
    await expect(client(transport, 2).generate(args())).rejects.toBeInstanceOf(LlmUnavailableError);
    // 1 initial + 2 retries = 3 attempts.
    expect(transport.calls).toHaveLength(3);
  });

  it('throws immediately (no retry) on a non-retryable API error', async () => {
    const transport = new FakeTransport([{ kind: 'error', error: fatalApiError() }]);
    await expect(client(transport).generate(args())).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(transport.calls).toHaveLength(1);
  });
});

describe('timeout', () => {
  it('aborts a hung call and surfaces it as a transient failure', async () => {
    let aborts = 0;
    const hang: LLMTransport = {
      generate: (r) =>
        new Promise((_resolve, reject) => {
          r.abortSignal?.addEventListener('abort', () => {
            aborts++;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    };
    const c = new LLMClient({
      transport: hang,
      transientRetries: 0, // one timeout, then give up
      timeouts: { fast: 10 },
      backoff: () => 0,
      sleep: async () => {},
    });
    await expect(c.generate(args())).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(aborts).toBe(1);
  });
});
