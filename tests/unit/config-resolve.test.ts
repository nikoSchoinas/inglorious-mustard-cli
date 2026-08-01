import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the optional keyring so tests never touch the real OS keychain.
vi.mock('../../src/config/keyring.js', () => ({
  readKey: vi.fn(async () => null),
  writeKey: vi.fn(async () => true),
  deleteKey: vi.fn(async () => true),
  keyringAvailable: vi.fn(async () => false),
}));

import { readKey } from '../../src/config/keyring.js';
import { configPath, loadConfig, saveConfig } from '../../src/config/paths.js';
import { resolveApiKey } from '../../src/config/resolve.js';
import type { MustardConfig } from '../../src/schemas/config.js';

const mockedReadKey = vi.mocked(readKey);

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mustard-home-'));
  mockedReadKey.mockReset();
  mockedReadKey.mockResolvedValue(null);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function config(overrides: Partial<MustardConfig> = {}): MustardConfig {
  return {
    provider: 'anthropic',
    models: { fast: 'f', deep: 'd' },
    apiKeySource: 'config',
    telemetry: false,
    ...overrides,
  };
}

describe('resolveApiKey precedence (env → config → keyring)', () => {
  it('prefers the environment variable', async () => {
    const result = await resolveApiKey(config({ apiKey: 'from-config' }), {
      env: { ANTHROPIC_API_KEY: 'from-env' },
    });
    expect(result).toEqual({ key: 'from-env', source: 'env' });
    expect(mockedReadKey).not.toHaveBeenCalled();
  });

  it('falls back to the config file when no env var is set', async () => {
    const result = await resolveApiKey(config({ apiKey: 'from-config' }), { env: {} });
    expect(result).toEqual({ key: 'from-config', source: 'config' });
  });

  it('falls back to the keyring when env and config are absent', async () => {
    mockedReadKey.mockResolvedValue('from-keyring');
    const result = await resolveApiKey(config({ apiKey: undefined }), { env: {} });
    expect(result).toEqual({ key: 'from-keyring', source: 'keyring' });
  });

  it('reports missing when the key is required but nowhere to be found', async () => {
    const result = await resolveApiKey(config({ apiKey: undefined }), { env: {} });
    expect(result).toEqual({ key: null, source: 'missing' });
  });

  it('reports none for a keyless local provider (ollama)', async () => {
    const result = await resolveApiKey(config({ provider: 'ollama', apiKey: undefined }), {
      env: {},
    });
    expect(result).toEqual({ key: null, source: 'none' });
    expect(mockedReadKey).not.toHaveBeenCalled();
  });
});

describe('config file persistence', () => {
  it('round-trips and writes with mode 0600', () => {
    saveConfig(config({ apiKey: 'secret' }), home);
    const mode = statSync(configPath(home)).mode & 0o777;
    expect(mode).toBe(0o600);

    const loaded = loadConfig(home);
    expect(loaded?.apiKey).toBe('secret');
    expect(loaded?.provider).toBe('anthropic');
  });

  it('returns null when no config file exists', () => {
    expect(loadConfig(home)).toBeNull();
  });
});
