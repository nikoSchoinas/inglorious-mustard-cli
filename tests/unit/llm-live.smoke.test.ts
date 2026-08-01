import { describe, expect, it } from 'vitest';
import { LLMClient } from '../../src/llm/client.js';
import { checkConnectivity } from '../../src/llm/connectivity.js';
import { createModelForTier } from '../../src/llm/router.js';
import { RealTransport } from '../../src/llm/transport.js';
import type { MustardConfig } from '../../src/schemas/config.js';

/**
 * A single live call, run only when ANTHROPIC_API_KEY is set. It is skipped in CI
 * and on any machine without a key, so it never gates the suite (technical-plan M4
 * acceptance). It exists so a human can prove the real transport works end to end.
 */
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasKey)('live provider smoke (anthropic)', () => {
  const config: MustardConfig = {
    provider: 'anthropic',
    models: { fast: 'claude-haiku-4-5', deep: 'claude-sonnet-4-6' },
    apiKeySource: 'env',
    telemetry: false,
  };

  it('passes the connectivity check with a real key', async () => {
    const result = await checkConnectivity(config, {
      transport: new RealTransport(),
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    expect(result.status).toBe('ok');
  });

  it('generates a validated object from a real call', async () => {
    const { z } = await import('zod');
    const client = new LLMClient({ transport: new RealTransport() });
    const model = createModelForTier(config, 'fast', { apiKey: process.env.ANTHROPIC_API_KEY });
    const outcome = await client.generate({
      pass: 'smoke',
      tier: 'fast',
      system: { id: 'smoke', version: '1', text: 'Reply with the requested JSON only.' },
      input: { ask: 'capital' },
      prompt: 'Return {"answer": "the capital of France"} with answer set to the city name.',
      schema: z.object({ answer: z.string() }),
      model,
    });
    expect(outcome.status).toBe('ok');
  });
});
