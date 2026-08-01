import { describe, expect, it } from 'vitest';
import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { ReplayTransport } from '../../src/llm/transport.js';
import { Phase3Output } from '../../src/schemas/schema-model.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import {
  CANCEL_3_SCRIPT,
  FULL_3_SCRIPT,
  RESUME_3_SCRIPT,
  phase3StartSession,
  runPhase3Scripted,
} from '../golden/phase3-fixture.js';

/**
 * M10 acceptance test (technical-plan §5): Phase 3 — schema derivation, ambiguous-
 * cardinality disambiguation, enum discovery and `03-SCHEMAS.md`, driven in REPLAY mode
 * over the committed fixture (zero tokens). Proves the resolved `Phase3Output` lands in
 * session state, exactly one confirm is asked for the one ambiguous relationship,
 * `03-SCHEMAS.md` is the only artifact (never `03-STRUCTURE.md` — pitfall §7.1), and
 * Ctrl-C → resume never re-runs completed work.
 */

function replayTransport(): ReplayTransport {
  return new ReplayTransport(defaultFixturesRoot());
}

function memorySave(): { save: (s: MustardSession) => MustardSession; last: () => MustardSession } {
  let latest: MustardSession | undefined;
  return {
    save: (s) => {
      latest = s;
      return s;
    },
    last: () => {
      if (latest === undefined) {
        throw new Error('nothing saved yet');
      }
      return latest;
    },
  };
}

function phase3State(session: MustardSession): PhaseState {
  const ps = session.phases.find((p) => p.id === 3);
  if (ps === undefined) {
    throw new Error('no Phase 3 state');
  }
  return ps;
}

function outputOf(session: MustardSession): Phase3Output {
  return Phase3Output.parse(phase3State(session).synthesisedObject);
}

describe('runPhase3 — full replay run', () => {
  it('derives the model, resolves cardinality and enums, and writes 03-SCHEMAS.md', async () => {
    const { session, writes } = await runPhase3Scripted({
      transport: replayTransport(),
      script: FULL_3_SCRIPT,
    });
    const output = outputOf(session);

    // The ambiguous Habit → CheckIn relationship is resolved to one_to_many, confidence high.
    const habit = output.models.find((m) => m.entityId === 'e1');
    expect(habit?.relationships).toEqual([
      { toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' },
    ]);

    // The enum values were captured (two picked + one custom).
    const status = habit?.attributes.find((a) => a.name === 'status');
    expect(status?.enumValues).toEqual(['active', 'paused', 'completed']);

    // The global retention policy is recorded, and mirrored into facts.
    expect(output.retention).toBe('recoverable');
    expect(session.facts['data.retention']).toBe('recoverable');

    // ACCEPTANCE: exactly one confirm was asked — one per ambiguous relationship.
    const cardMarkers = phase3State(session).answers.filter((a) =>
      a.questionId.startsWith('p3.card.'),
    );
    expect(cardMarkers).toHaveLength(1);

    // ACCEPTANCE: 03-SCHEMAS.md is the only artifact — never 03-STRUCTURE.md (pitfall §7.1).
    expect(writes.map((w) => w.name)).toEqual(['03-SCHEMAS.md']);
    expect(writes.map((w) => w.name)).not.toContain('03-STRUCTURE.md');

    // The phase is accepted and the mission advances to Phase 4.
    expect(phase3State(session).status).toBe('accepted');
    expect(phase3State(session).artifactPaths).toEqual(['03-SCHEMAS.md']);
    expect(session.currentPhase).toBe(4);
  });

  it('snapshots the rendered 03-SCHEMAS.md', async () => {
    const { writes } = await runPhase3Scripted({
      transport: replayTransport(),
      script: FULL_3_SCRIPT,
    });
    expect(writes[0]?.body).toMatchSnapshot();
  });
});

describe('runPhase3 — Ctrl-C then resume', () => {
  it('resumes without re-asking cardinality or re-running enum discovery', async () => {
    const { save, last } = memorySave();
    const start = phase3StartSession();

    // Run 1: cancel at the retention select (cardinality + enum already done).
    await expect(
      runPhase3Scripted({
        transport: replayTransport(),
        script: CANCEL_3_SCRIPT,
        session: start,
        save,
      }),
    ).rejects.toBeInstanceOf(PromptCancelledError);

    // Run 2: resume with only the remaining answers.
    const { session: resumed } = await runPhase3Scripted({
      transport: replayTransport(),
      script: RESUME_3_SCRIPT,
      session: last(),
      save,
    });

    // The resumed result matches a clean single run.
    const { session: clean } = await runPhase3Scripted({
      transport: replayTransport(),
      script: FULL_3_SCRIPT,
    });
    expect(outputOf(resumed)).toEqual(outputOf(clean));
    expect(phase3State(resumed).status).toBe('accepted');
  });
});
