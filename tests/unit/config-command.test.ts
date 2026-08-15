import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/keyring.js', () => ({
  readKey: vi.fn(async () => null),
  writeKey: vi.fn(async () => true),
  deleteKey: vi.fn(async () => true),
  keyringAvailable: vi.fn(async () => true),
}));

import { applyConfigSet, describeConfig } from '../../src/commands/config.js';
import { writeKey } from '../../src/config/keyring.js';
import { bundledDefaults } from '../../src/llm/manifest.js';

const mockedWriteKey = vi.mocked(writeKey);

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mustard-cfg-'));
  mockedWriteKey.mockReset();
  mockedWriteKey.mockResolvedValue(true);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('applyConfigSet', () => {
  it('creates a fresh config seeded from the manifest and stores the key in the file', async () => {
    const result = await applyConfigSet(
      { provider: 'anthropic', apiKey: 'sk-1', keySource: 'config' },
      home,
    );
    // Only `deep` is persisted — the retired fast tier never reaches disk.
    const defaults = bundledDefaults('anthropic');
    expect(result.config.models).toEqual({ deep: defaults.deep });
    expect(result.config.apiKeySource).toBe('config');
    expect(result.config.apiKey).toBe('sk-1');
    expect(result.keyStored).toBe('config');
  });

  it('throws when no provider is available to start from', async () => {
    await expect(applyConfigSet({ deep: 'x' }, home)).rejects.toThrow(/no provider/i);
  });

  it('reseeds models from the manifest when the provider changes', async () => {
    await applyConfigSet({ provider: 'anthropic', apiKey: 'sk', keySource: 'config' }, home);
    const result = await applyConfigSet({ provider: 'openai' }, home);
    expect(result.config.models).toEqual({ deep: bundledDefaults('openai').deep });
  });

  it('stores the key in the keyring and keeps it out of the file', async () => {
    const result = await applyConfigSet(
      { provider: 'anthropic', apiKey: 'sk-keyring', keySource: 'keyring' },
      home,
    );
    expect(mockedWriteKey).toHaveBeenCalledWith('anthropic', 'sk-keyring');
    expect(result.config.apiKeySource).toBe('keyring');
    expect(result.config.apiKey).toBeUndefined();
    expect(result.keyStored).toBe('keyring');
  });

  it('degrades to config-file storage when the keyring is unavailable', async () => {
    mockedWriteKey.mockResolvedValue(false);
    const result = await applyConfigSet(
      { provider: 'anthropic', apiKey: 'sk-x', keySource: 'keyring' },
      home,
    );
    expect(result.degradedFromKeyring).toBe(true);
    expect(result.config.apiKeySource).toBe('config');
    expect(result.config.apiKey).toBe('sk-x');
    expect(result.keyStored).toBe('config');
  });
});

describe('describeConfig', () => {
  it('guides the user when nothing is configured', async () => {
    const text = await describeConfig(home);
    expect(text).toMatch(/no configuration/i);
  });

  it('summarises a saved config', async () => {
    await applyConfigSet({ provider: 'anthropic', apiKey: 'sk', keySource: 'config' }, home);
    const text = await describeConfig(home);
    expect(text).toMatch(/provider/i);
    expect(text).toMatch(/anthropic/);
  });
});
