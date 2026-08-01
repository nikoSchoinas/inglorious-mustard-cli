import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInit } from '../../src/commands/init.js';
import { runResume } from '../../src/commands/resume.js';
import { formatStatus, runStatus } from '../../src/commands/status.js';
import { saveSession } from '../../src/engine/session.js';
import { makeSession } from './fixtures.js';

/**
 * Guard-rail branches of the M6 commands: `init` refusing when a session exists, and
 * `resume` / `status` handling the not-found case. The happy paths are covered by
 * the skeleton acceptance test.
 */

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}
const exit = (code: number): never => {
  throw new ExitSignal(code);
};

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), 'mustard-cmd-'));
}

describe('runInit', () => {
  it('refuses when a session already exists', async () => {
    const cwd = tempCwd();
    saveSession(makeSession(), cwd);
    const printed: string[] = [];
    await expect(
      runInit({ cwd, exit, print: (m) => printed.push(m), installCancel: false }),
    ).rejects.toBeInstanceOf(ExitSignal);
    expect(printed.join('\n')).toContain('mustard resume');
  });
});

describe('runResume', () => {
  it('errors with an init hint when no session exists', async () => {
    const cwd = tempCwd();
    const printed: string[] = [];
    await expect(
      runResume({ cwd, exit, print: (m) => printed.push(m), installCancel: false }),
    ).rejects.toBeInstanceOf(ExitSignal);
    expect(printed.join('\n')).toContain('mustard init');
  });
});

describe('runStatus', () => {
  it('errors with an init hint when no session exists', async () => {
    const cwd = tempCwd();
    const printed: string[] = [];
    await expect(runStatus({ cwd, exit, print: (m) => printed.push(m) })).rejects.toBeInstanceOf(
      ExitSignal,
    );
    expect(printed.join('\n')).toContain('mustard init');
  });
});

describe('formatStatus', () => {
  it('shows (unnamed) for a session with no project name', () => {
    const out = formatStatus(makeSession({ projectName: '' }));
    expect(out).toContain('Mission: (unnamed)');
  });
});
