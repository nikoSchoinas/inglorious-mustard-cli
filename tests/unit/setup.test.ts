import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyConfigSet } from '../../src/commands/config.js';
import { type SetupDeps, runSetup } from '../../src/commands/setup.js';
import { configExists } from '../../src/config/index.js';
import type { ConnectivityResult } from '../../src/llm/connectivity.js';
import { FakeTransport } from '../../src/llm/transport.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';

/**
 * The Phase 0 "0.5" setup step (spec §8.3 step 0.5) — key capture, connectivity and
 * telemetry consent. The skeleton test stubs this; here we cover its own logic:
 * config reuse, fresh interactive setup, env-key detection, and the fail-fast exit
 * on a bad key.
 */

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'mustard-home-'));
}

function okCheck(): SetupDeps['checkConnectivity'] {
  return async () => ({ status: 'ok' }) as ConnectivityResult;
}

function baseDeps(script: ScriptedStep[], overrides: Partial<SetupDeps> = {}): SetupDeps {
  return {
    prompter: new ScriptedPrompter(script),
    transport: new FakeTransport([]),
    checkConnectivity: okCheck(),
    ...overrides,
  };
}

describe('runSetup', () => {
  it('reuses an existing config for the same provider with a resolvable key, asking nothing', async () => {
    const home = tempHome();
    await applyConfigSet(
      { provider: 'anthropic', apiKey: 'stored-key', keySource: 'config' },
      home,
    );

    const result = await runSetup('anthropic', baseDeps([], { home, env: {} }));
    expect(result.config.provider).toBe('anthropic');
    expect(result.apiKey).toBe('stored-key');
  });

  it('runs fresh interactive setup when no config exists, storing the entered key', async () => {
    const home = tempHome();
    const result = await runSetup(
      'anthropic',
      baseDeps(
        [
          { kind: 'text', value: 'entered-key' },
          { kind: 'confirm', value: false },
        ],
        { home, env: {} },
      ),
    );
    expect(configExists(home)).toBe(true);
    expect(result.apiKey).toBe('entered-key');
    expect(result.config.telemetry).toBe(false);
  });

  it('uses an environment key without prompting for one', async () => {
    const home = tempHome();
    const result = await runSetup(
      'anthropic',
      baseDeps([{ kind: 'confirm', value: true }], {
        home,
        env: { ANTHROPIC_API_KEY: 'env-key' },
      }),
    );
    expect(result.apiKey).toBe('env-key');
    expect(result.config.telemetry).toBe(true);
  });

  it('fails fast (exit 1) when the key is rejected at the connectivity check', async () => {
    const home = tempHome();
    let exited: number | undefined;
    const deps = baseDeps(
      [
        { kind: 'text', value: 'bad-key' },
        { kind: 'confirm', value: false },
      ],
      {
        home,
        env: {},
        checkConnectivity: async () =>
          ({ status: 'invalid-key', detail: 'rejected' }) as ConnectivityResult,
        print: () => {},
        exit: (code: number) => {
          exited = code;
          throw new ExitSignal(code);
        },
      },
    );
    await expect(runSetup('anthropic', deps)).rejects.toBeInstanceOf(ExitSignal);
    expect(exited).toBe(1);
  });
});
