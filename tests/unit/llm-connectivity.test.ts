import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { checkConnectivity } from '../../src/llm/connectivity.js';
import { FakeTransport } from '../../src/llm/transport.js';
import type { MustardConfig } from '../../src/schemas/config.js';

const config: MustardConfig = {
  provider: 'anthropic',
  models: { fast: 'f', deep: 'd' },
  apiKeySource: 'env',
  telemetry: false,
};

const clientOptions = { transientRetries: 0, backoff: () => 0, sleep: async () => {} };

describe('checkConnectivity', () => {
  it('returns ok when the provider answers', async () => {
    const transport = new FakeTransport([{ kind: 'object', value: { ok: true } }]);
    const result = await checkConnectivity(config, { transport, clientOptions, apiKey: 'k' });
    expect(result).toEqual({ status: 'ok' });
  });

  it('detects an invalid key from a 401', async () => {
    const transport = new FakeTransport([
      {
        kind: 'error',
        error: new APICallError({
          message: 'invalid x-api-key',
          url: 'https://example.test',
          requestBodyValues: {},
          statusCode: 401,
          isRetryable: false,
        }),
      },
    ]);
    const result = await checkConnectivity(config, { transport, clientOptions, apiKey: 'bad' });
    expect(result.status).toBe('invalid-key');
  });

  it('reports no-network on a fetch failure', async () => {
    const transport = new FakeTransport([{ kind: 'error', error: new Error('fetch failed') }]);
    const result = await checkConnectivity(config, { transport, clientOptions, apiKey: 'k' });
    expect(result.status).toBe('no-network');
  });
});
