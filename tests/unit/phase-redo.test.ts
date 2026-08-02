import { describe, expect, it } from 'vitest';
import { runPhaseCommand } from '../../src/commands/phase.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';

/**
 * `mustard phase <n> --redo` (spec §9.6, M14): the downstream-staleness warning and
 * the cascade offer. The mission driver itself is stubbed — this milestone owns the
 * warn/confirm/reset logic, not re-running the phases.
 */

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}
const exit = (code: number): never => {
  throw new ExitSignal(code);
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
    acceptedAt: '2026-08-01T00:00:00.000Z',
  };
}

function fullSession(): MustardSession {
  return {
    schemaVersion: 1,
    projectName: 'P',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 8,
    phases: [0, 1, 2, 3, 4, 5, 6, 7].map(accepted),
    facts: { provider: 'anthropic' },
    factSources: {},
    tasks: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function harness(script: ScriptedStep[]) {
  const prompter = new ScriptedPrompter(script);
  const printed: string[] = [];
  let driven: MustardSession | undefined;
  const deps = {
    redo: undefined as boolean | undefined,
    load: () => fullSession(),
    save: (s: MustardSession) => s,
    drive: async (s: MustardSession) => {
      driven = s;
      return s;
    },
    prompter,
    print: (m: string) => printed.push(m),
    exit,
    installCancel: false as const,
    now: () => '2026-08-02T00:00:00.000Z',
  };
  return { prompter, printed, deps, driven: () => driven };
}

describe('runPhaseCommand', () => {
  it('previews the downstream impact and writes nothing without --redo', async () => {
    const h = harness([]);
    await runPhaseCommand(3, { ...h.deps, redo: false });
    expect(h.driven()).toBeUndefined(); // driver never invoked
    const out = h.printed.join('\n');
    expect(out).toContain('04-STACK.md');
    expect(out).toContain('mustard phase 3 --redo');
  });

  it('cascade-yes resets phases 3–7 and leaves 0–2 accepted', async () => {
    const h = harness([{ kind: 'confirm', value: true }]);
    await runPhaseCommand(3, { ...h.deps, redo: true });
    const driven = h.driven();
    expect(driven).toBeDefined();
    const status = (id: number) => driven?.phases.find((p) => p.id === id)?.status;
    expect([status(0), status(1), status(2)]).toEqual(['accepted', 'accepted', 'accepted']);
    expect([status(3), status(4), status(5), status(6), status(7)]).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    // The staleness warning was surfaced.
    expect(h.prompter.notes.some((n) => n.message.includes('04-STACK.md'))).toBe(true);
  });

  it('cascade-no resets only the target phase', async () => {
    const h = harness([{ kind: 'confirm', value: false }]);
    await runPhaseCommand(3, { ...h.deps, redo: true });
    const driven = h.driven();
    const status = (id: number) => driven?.phases.find((p) => p.id === id)?.status;
    expect(status(3)).toBe('pending');
    expect([status(4), status(5), status(6), status(7)]).toEqual([
      'accepted',
      'accepted',
      'accepted',
      'accepted',
    ]);
  });

  it('rejects an out-of-range phase number', async () => {
    const h = harness([]);
    await expect(runPhaseCommand(9, { ...h.deps, redo: true })).rejects.toBeInstanceOf(ExitSignal);
  });
});
