import { describe, expect, it } from 'vitest';
import { bundledDefaults } from '../../src/llm/manifest.js';
import { createModel, modelIdFor, resolveModels } from '../../src/llm/router.js';
import type { MustardConfig, Provider } from '../../src/schemas/config.js';

function config(overrides: Partial<MustardConfig> = {}): MustardConfig {
  return {
    provider: 'anthropic',
    models: { fast: 'fast-model', deep: 'deep-model' },
    apiKeySource: 'env',
    telemetry: false,
    ...overrides,
  };
}

describe('resolveModels / modelIdFor', () => {
  it('returns the configured model IDs', () => {
    expect(resolveModels(config())).toEqual({ fast: 'fast-model', deep: 'deep-model' });
    expect(modelIdFor(config(), 'fast')).toBe('fast-model');
    expect(modelIdFor(config(), 'deep')).toBe('deep-model');
  });

  it('falls back to the manifest defaults when a tier is blank', () => {
    const cfg = config({ models: { fast: '', deep: '' } as never });
    const defaults = bundledDefaults('anthropic');
    expect(resolveModels(cfg)).toEqual(defaults);
  });
});

describe('bundledDefaults', () => {
  it('has non-empty fast/deep defaults for every provider', () => {
    for (const p of ['anthropic', 'openai', 'google', 'ollama'] as Provider[]) {
      const d = bundledDefaults(p);
      expect(d.fast.length).toBeGreaterThan(0);
      expect(d.deep.length).toBeGreaterThan(0);
    }
  });
});

describe('createModel', () => {
  it('builds a handle for each provider without performing I/O', () => {
    for (const p of ['anthropic', 'openai', 'google', 'ollama'] as Provider[]) {
      const model = createModel(p, 'some-model', { apiKey: 'k' });
      expect(model).toBeTypeOf('object');
    }
  });
});
