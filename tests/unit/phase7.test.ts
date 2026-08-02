import { describe, expect, it } from 'vitest';
import { BEGIN, END } from '../../src/render/adapters/sentinel.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import {
  CANCEL_7_SCRIPT,
  DECLINE_7_SCRIPT,
  FULL_7_SCRIPT,
  ORDERED_TASKS,
  phase7StartSession,
  runPhase7Scripted,
} from '../golden/phase7-fixture.js';

/**
 * M13 acceptance test (technical-plan §5): Phase 7 — Development & Documentation. Pure
 * generation behind one bundle-level confirm. Proves a prompt card per task is written,
 * the repo-root adapter is sentinel-wrapped, `00-BRIEFING.md` is written LAST (pitfall
 * §7.7), declining writes nothing, and re-running is a zero diff.
 */

function phase7State(session: MustardSession): PhaseState {
  const ps = session.phases.find((p) => p.id === 7);
  if (ps === undefined) {
    throw new Error('no Phase 7 state');
  }
  return ps;
}

describe('runPhase7 — full run (accepted bundle)', () => {
  it('writes a prompt card per task, the adapter, and the briefing last', async () => {
    const { session, writes, adapterFiles } = await runPhase7Scripted({ script: FULL_7_SCRIPT });

    // One card per roadmap task, under 07-PROMPTS/.
    const cardWrites = writes.filter((w) => w.name.startsWith('07-PROMPTS/'));
    expect(cardWrites).toHaveLength(ORDERED_TASKS.length);
    expect(cardWrites.map((w) => w.name)).toContain('07-PROMPTS/T001-set-up-the-project-and-ci.md');

    // The briefing is the LAST mustard write (pitfall §7.7).
    expect(writes[writes.length - 1]?.name).toBe('00-BRIEFING.md');

    // The adapter file for the Phase 0 agent (claude-code → CLAUDE.md) is written at the root.
    const adapter = adapterFiles.get('CLAUDE.md');
    expect(adapter).toBeDefined();
    expect(adapter).toContain(BEGIN);
    expect(adapter).toContain(END);

    // The phase is accepted and the mission is complete.
    expect(phase7State(session).status).toBe('accepted');
    expect(phase7State(session).artifactPaths).toContain('00-BRIEFING.md');
    expect(session.currentPhase).toBe(8);
  });

  it('inlines the AI-LAWS, acceptance criteria and a do-not-touch list on each card', async () => {
    const { writes } = await runPhase7Scripted({ script: FULL_7_SCRIPT });
    // T001 (setup) should warn off files owned by other tasks (e.g. the auth session file).
    const card = writes.find(
      (w) => w.name === '07-PROMPTS/T001-set-up-the-project-and-ci.md',
    )?.body;
    expect(card).toContain('## Laws — apply all of these');
    expect(card).toContain('Write tests alongside every feature.');
    expect(card).toContain('## Acceptance criteria');
    expect(card).toContain('## Do not touch');
    expect(card).toContain('src/auth/session.ts');
  });

  it('snapshots a prompt card, the adapter and the briefing', async () => {
    const { writes, adapterFiles } = await runPhase7Scripted({ script: FULL_7_SCRIPT });
    expect(
      writes.find((w) => w.name === '07-PROMPTS/T003-create-a-habit.md')?.body,
    ).toMatchSnapshot('prompt-card-T003');
    expect(writes.find((w) => w.name === '00-BRIEFING.md')?.body).toMatchSnapshot('briefing');
    expect(adapterFiles.get('CLAUDE.md')).toMatchSnapshot('adapter-claude');
  });
});

describe('runPhase7 — bundle gate', () => {
  it('writes nothing and stays resumable when the user declines', async () => {
    const { session, writes, adapterFiles } = await runPhase7Scripted({ script: DECLINE_7_SCRIPT });
    expect(writes).toHaveLength(0);
    expect(adapterFiles.size).toBe(0);
    // Not accepted; the mission has not advanced past Phase 7.
    expect(phase7State(session).status).toBe('in_progress');
    expect(session.currentPhase).toBe(7);
  });

  it('propagates Ctrl-C at the gate without writing anything', async () => {
    await expect(runPhase7Scripted({ script: CANCEL_7_SCRIPT })).rejects.toBeInstanceOf(
      PromptCancelledError,
    );
  });
});

describe('runPhase7 — idempotency', () => {
  it('is a zero diff when run twice (sentinel merge on the adapter)', async () => {
    const memorySave = (): {
      save: (s: MustardSession) => MustardSession;
      last: () => MustardSession;
    } => {
      let latest: MustardSession | undefined;
      return {
        save: (s) => {
          latest = s;
          return s;
        },
        last: () => {
          if (latest === undefined) {
            throw new Error('nothing saved');
          }
          return latest;
        },
      };
    };

    // First run writes everything.
    const first = await runPhase7Scripted({ script: FULL_7_SCRIPT });
    const firstAdapter = first.adapterFiles.get('CLAUDE.md');

    // A fresh, not-yet-accepted session re-generates into an adapter file that already
    // has the region — the merge must reproduce identical bytes.
    const { save } = memorySave();
    const reGen = await runPhase7Scripted({
      script: FULL_7_SCRIPT,
      session: phase7StartSession(),
      adapterIo: seededAdapter('CLAUDE.md', firstAdapter ?? ''),
      save,
    });
    expect(reGen.adapterFiles.get('CLAUDE.md')).toBe(firstAdapter);
  });
});

/** A memory adapter IO seeded with one existing file, for the idempotency check. */
function seededAdapter(path: string, body: string) {
  const files = new Map<string, string>([[path, body]]);
  return {
    files,
    read: (p: string) => files.get(p),
    write: (p: string, b: string) => {
      files.set(p, b);
    },
  };
}
