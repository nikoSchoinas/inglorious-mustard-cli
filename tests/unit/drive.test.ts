import { describe, expect, it } from 'vitest';
import { driveMission } from '../../src/commands/drive.js';
import type { Passes } from '../../src/llm/passes/index.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import { ScriptedPrompter } from '../../src/ui/scripted-prompter.js';
import { CLOCK, CONFIG } from '../golden/phase1-skeleton.js';

/**
 * `driveMission` orchestration behaviours that no single phase runner owns —
 * here, the hand-edit staleness note (technical-plan §2.4): later phases derive
 * from the typed `synthesisedObject`, so before a phase runs the driver must
 * say when an earlier accepted phase's artifact was rewritten in $EDITOR.
 */

function acceptedPhase(id: number, overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    id,
    status: 'accepted',
    answers: [],
    followUpsAsked: 0,
    analysisRuns: 0,
    artifactPaths: [],
    edited: false,
    acceptedAt: CLOCK(),
    ...overrides,
  };
}

/** Phases 0–2 accepted; Phase 3 pending. Phase 2 optionally hand-edited. */
function sessionBeforePhase3(edited: boolean): MustardSession {
  const ts = CLOCK();
  return {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 3,
    phases: [
      acceptedPhase(0),
      acceptedPhase(1, { artifactPaths: ['01-MANIFESTO.md', '01-AI-LAWS.md'] }),
      acceptedPhase(2, {
        artifactPaths: ['02-USE-CASES.md'],
        edited,
        // Presence of the seeded marker keeps the driver from re-running part A.
        answers: [
          {
            questionId: 'p2b.seeded',
            type: 'confirm',
            value: true,
            source: 'derived',
            askedAt: ts,
          },
        ],
      }),
    ],
    facts: { provider: 'anthropic' },
    factSources: { provider: 'answer' },
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

async function driveToPhase3(session: MustardSession): Promise<ScriptedPrompter> {
  const prompter = new ScriptedPrompter([]);
  await driveMission(session, {
    prompter,
    now: CLOCK,
    save: (s) => s,
    setup: async () => ({ config: CONFIG, apiKey: 'dummy' }),
    buildPasses: () => ({}) as unknown as Passes,
    // Stub Phase 3 to complete immediately — this test is about the driver.
    runPhase3: async (s) => ({
      ...s,
      phases: [...s.phases, acceptedPhase(3, { artifactPaths: ['03-SCHEMAS.md'] })],
      currentPhase: 4,
    }),
    // Stub Phase 4 and Phase 5 too, so the driver reaches the end without a real interrogation.
    runPhase4: async (s) => s,
    runPhase5: async (s) => s,
  });
  return prompter;
}

describe('driveMission — edited-artifact staleness note (§2.4)', () => {
  it('notes an earlier hand-edited phase before the next phase runs', async () => {
    const prompter = await driveToPhase3(sessionBeforePhase3(true));
    const note = prompter.notes.find((n) => n.title === 'Edited artifact');
    expect(note?.message).toContain('02-USE-CASES.md');
    expect(note?.message).toContain('Phase 2');
  });

  it('stays quiet when nothing was hand-edited', async () => {
    const prompter = await driveToPhase3(sessionBeforePhase3(false));
    expect(prompter.notes.some((n) => n.title === 'Edited artifact')).toBe(false);
  });
});
