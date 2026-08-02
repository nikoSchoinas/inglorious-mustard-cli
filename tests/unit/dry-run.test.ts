import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { driveMission } from '../../src/commands/drive.js';
import { runInit } from '../../src/commands/init.js';
import type { Passes } from '../../src/llm/passes/index.js';
import type { MustardConfig } from '../../src/schemas/config.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import { ScriptedPrompter } from '../../src/ui/scripted-prompter.js';

/**
 * `--dry-run` (spec §9.6): run the interrogation, write nothing. Proves both write
 * paths are no-op'd — the up-front `init` session persist and the driver's artifact IO.
 */

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}
const exit = (code: number): never => {
  throw new ExitSignal(code);
};
const now = () => '2026-08-02T00:00:00.000Z';

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), 'mustard-dry-'));
}

describe('init --dry-run', () => {
  it('creates no mustard/ directory (a real run would)', async () => {
    const dry = tempCwd();
    await expect(
      runInit({
        cwd: dry,
        dryRun: true,
        prompter: new ScriptedPrompter([{ kind: 'cancel' }]),
        exit,
        print: () => {},
        installCancel: false,
        now,
      }),
    ).rejects.toBeInstanceOf(ExitSignal);
    expect(existsSync(join(dry, 'mustard'))).toBe(false);

    // Control: the identical run without --dry-run persists the fresh session up front.
    const wet = tempCwd();
    await expect(
      runInit({
        cwd: wet,
        dryRun: false,
        prompter: new ScriptedPrompter([{ kind: 'cancel' }]),
        exit,
        print: () => {},
        installCancel: false,
        now,
      }),
    ).rejects.toBeInstanceOf(ExitSignal);
    expect(existsSync(join(wet, 'mustard'))).toBe(true);
  });
});

describe('driveMission --dry-run', () => {
  const config: MustardConfig = {
    provider: 'anthropic',
    models: { fast: 'f', deep: 'd' },
    apiKeySource: 'env',
    telemetry: false,
  };

  function accepted(id: number): PhaseState {
    return {
      id,
      status: 'accepted',
      answers: [],
      followUpsAsked: 0,
      analysisRuns: 0,
      artifactPaths: [],
      edited: false,
      acceptedAt: now(),
    };
  }

  function session(): MustardSession {
    return {
      schemaVersion: 1,
      projectName: 'P',
      literacy: 'some',
      agentTarget: 'claude-code',
      currentPhase: 7,
      phases: [0, 1, 2, 3, 4, 5, 6].map(accepted),
      facts: { provider: 'anthropic' },
      factSources: {},
      tasks: [],
      createdAt: now(),
      updatedAt: now(),
    };
  }

  function deps(cwd: string, dryRun: boolean) {
    return {
      prompter: new ScriptedPrompter([]),
      cwd,
      dryRun,
      now,
      setup: async () => ({ config, apiKey: 'k' }),
      buildPasses: () => ({}) as unknown as Passes,
      // Phase 7 stub writes a probe artifact through whatever IO the driver hands it.
      runPhase7: async (
        s: MustardSession,
        d: { io?: { writeArtifact(n: string, b: string): void } },
      ) => {
        d.io?.writeArtifact('probe.md', 'x');
        return s;
      },
    };
  }

  it('routes artifact writes to a no-op sink', async () => {
    const cwd = tempCwd();
    await driveMission(session(), deps(cwd, true));
    expect(existsSync(join(cwd, 'mustard', 'probe.md'))).toBe(false);
  });

  it('control: without --dry-run the same phase writes the artifact', async () => {
    const cwd = tempCwd();
    await driveMission(session(), deps(cwd, false));
    expect(existsSync(join(cwd, 'mustard', 'probe.md'))).toBe(true);
  });
});
