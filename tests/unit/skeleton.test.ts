import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runInit } from '../../src/commands/init.js';
import { runResume } from '../../src/commands/resume.js';
import { formatStatus } from '../../src/commands/status.js';
import { loadSession, mustardDir } from '../../src/engine/session.js';
import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { ReplayTransport } from '../../src/llm/transport.js';
import {
  CANCEL_SCRIPT,
  FULL_SCRIPT,
  RESUME_SCRIPT,
  skeletonDeps,
} from '../golden/phase1-skeleton.js';

/**
 * The M6 skeleton acceptance test (technical-plan §4, §5-M6) — golden project #1,
 * the single-user habit tracker. Drives `init` → Phase 0 → the 0.5 setup step →
 * Phase 1 entirely in REPLAY mode (committed fixtures, zero tokens), then proves the
 * Ctrl-C → `resume` identity and snapshots `status`. This is the template every
 * later phase milestone extends.
 */

// A test-injected exit that unwinds instead of terminating the process.
class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}
const exit = (code: number): never => {
  throw new ExitSignal(code);
};
const silent = (): void => {};

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), 'mustard-skeleton-'));
}

function replayTransport(): ReplayTransport {
  return new ReplayTransport(defaultFixturesRoot());
}

function read(cwd: string, name: string): string {
  return readFileSync(join(mustardDir(cwd), name), 'utf8');
}

/** A clean, complete init run in replay mode. Returns the cwd for assertions. */
async function runCleanInit(): Promise<string> {
  const cwd = tempCwd();
  const { deps } = skeletonDeps({ cwd, transport: replayTransport(), script: FULL_SCRIPT });
  await runInit(deps);
  return cwd;
}

describe('M6 walking skeleton — init → Phase 0 → Phase 1 (replay)', () => {
  it('writes both artifacts and a valid, accepted session', async () => {
    const cwd = await runCleanInit();

    expect(existsSync(join(mustardDir(cwd), '01-MANIFESTO.md'))).toBe(true);
    expect(existsSync(join(mustardDir(cwd), '01-AI-LAWS.md'))).toBe(true);

    const manifesto = read(cwd, '01-MANIFESTO.md');
    const aiLaws = read(cwd, '01-AI-LAWS.md');
    expect(manifesto).toContain('# Habit Tracker — Manifesto');
    expect(manifesto).toContain('generated_by: mustard');
    expect(aiLaws).toContain('# AI Laws — Habit Tracker');

    const session = loadSession(cwd);
    expect(session.phases.find((p) => p.id === 0)?.status).toBe('accepted');
    expect(session.phases.find((p) => p.id === 1)?.status).toBe('accepted');
    expect(session.projectName).toBe('Habit Tracker');
    expect(session.literacy).toBe('some');
    expect(session.agentTarget).toBe('claude-code');
    expect(session.phases.find((p) => p.id === 1)?.artifactPaths).toEqual([
      '01-MANIFESTO.md',
      '01-AI-LAWS.md',
    ]);
  });

  it('keeps both artifacts within their caps', async () => {
    const cwd = await runCleanInit();
    // AI-LAWS ≤ 200 lines (§9.7).
    expect(read(cwd, '01-AI-LAWS.md').split('\n').length).toBeLessThanOrEqual(200);
    // Manifesto ≤ 10 numbered rules (the book's 8–10 cap, §8.4).
    const numbered = read(cwd, '01-MANIFESTO.md')
      .split('\n')
      .filter((l) => /^\d+\.\s/.test(l));
    expect(numbered.length).toBeLessThanOrEqual(10);
  });
});

describe('M6 walking skeleton — Ctrl-C then resume', () => {
  it('resumes at the exact next question and produces identical artifacts', async () => {
    const cwd = tempCwd();

    // First run cancels at p1.name (after answering p1.why).
    const { deps: cancelDeps } = skeletonDeps({
      cwd,
      transport: replayTransport(),
      script: CANCEL_SCRIPT,
      exit,
      print: silent,
    });
    await expect(runInit(cancelDeps)).rejects.toBeInstanceOf(ExitSignal);

    // Nothing is lost: Phase 0 accepted, Phase 1 in progress with `why` recorded,
    // and no artifacts written yet.
    const mid = loadSession(cwd);
    expect(mid.phases.find((p) => p.id === 0)?.status).toBe('accepted');
    const p1 = mid.phases.find((p) => p.id === 1);
    expect(p1?.status).toBe('in_progress');
    expect(p1?.answers.map((a) => a.questionId)).toEqual(['p1.why']);
    expect(existsSync(join(mustardDir(cwd), '01-MANIFESTO.md'))).toBe(false);

    // Resume with the remaining answers.
    const { deps: resumeDeps } = skeletonDeps({
      cwd,
      transport: replayTransport(),
      script: RESUME_SCRIPT,
    });
    await runResume(resumeDeps);

    expect(loadSession(cwd).phases.find((p) => p.id === 1)?.status).toBe('accepted');

    // The resumed artifacts are byte-identical to a clean single-run.
    const cleanCwd = await runCleanInit();
    expect(read(cwd, '01-MANIFESTO.md')).toBe(read(cleanCwd, '01-MANIFESTO.md'));
    expect(read(cwd, '01-AI-LAWS.md')).toBe(read(cleanCwd, '01-AI-LAWS.md'));
  });
});

describe('M6 walking skeleton — status', () => {
  it('reports phase progress after a completed run', async () => {
    const cwd = await runCleanInit();
    expect(formatStatus(loadSession(cwd))).toMatchSnapshot();
  });
});

afterEach(() => {
  // Temp dirs live under the OS tmpdir; the OS reclaims them. Nothing to do.
});
