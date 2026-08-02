import { describe, expect, it } from 'vitest';
import {
  PHASE_ARTIFACTS,
  downstreamArtifacts,
  downstreamPhases,
  resetPhase,
} from '../../src/engine/artifact-graph.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';

/**
 * The staleness graph as DATA (technical-plan §5 M14 risk, pitfall 8). These are the
 * exact assertions behind the `phase --redo` warning, including the deliberate
 * 03-STRUCTURE-is-Phase-4 wrinkle (pitfall §7.1).
 */

describe('downstreamArtifacts', () => {
  it('lists every downstream artifact when Phase 3 is re-run (the M14 acceptance line)', () => {
    // 03-STRUCTURE.md appears here because it is a Phase 4 artifact, not Phase 3.
    expect(downstreamArtifacts(3)).toEqual([
      '04-STACK.md',
      '03-STRUCTURE.md',
      '05-ARCHITECTURE.md',
      '05-DECISIONS.md',
      '06-ROADMAP.md',
      '07-PROMPTS/',
      '00-BRIEFING.md',
    ]);
  });

  it('has nothing downstream of the final phase', () => {
    expect(downstreamArtifacts(7)).toEqual([]);
  });

  it("never includes a phase's own artifacts", () => {
    expect(downstreamArtifacts(1)).not.toContain('01-MANIFESTO.md');
  });
});

describe('downstreamPhases', () => {
  it('returns every later phase', () => {
    expect(downstreamPhases(3)).toEqual([4, 5, 6, 7]);
    expect(downstreamPhases(6)).toEqual([7]);
    expect(downstreamPhases(7)).toEqual([]);
  });
});

describe('resetPhase', () => {
  function accepted(id: number): PhaseState {
    return {
      id,
      status: 'accepted',
      answers: [
        {
          questionId: 'q1',
          type: 'text',
          value: 'x',
          source: 'seed',
          askedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      followUpsAsked: 2,
      analysisRuns: 1,
      artifactPaths: ['03-SCHEMAS.md'],
      acceptedAt: '2026-08-01T00:00:00.000Z',
      edited: true,
      synthesisedObject: { some: 'thing' },
    };
  }

  const session: MustardSession = {
    schemaVersion: 1,
    projectName: 'P',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 4,
    phases: [accepted(3), accepted(4)],
    facts: {},
    factSources: {},
    tasks: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };

  it('clears the phase back to pending and drops derived state', () => {
    const next = resetPhase(session, 3);
    const ps = next.phases.find((p) => p.id === 3);
    expect(ps).toMatchObject({
      status: 'pending',
      answers: [],
      followUpsAsked: 0,
      analysisRuns: 0,
      artifactPaths: [],
      edited: false,
    });
    expect(ps?.acceptedAt).toBeUndefined();
    expect(ps?.synthesisedObject).toBeUndefined();
  });

  it('leaves sibling phases and the input session untouched (pure)', () => {
    const next = resetPhase(session, 3);
    expect(next.phases.find((p) => p.id === 4)?.status).toBe('accepted');
    // Purity: the original session's Phase 3 is still accepted.
    expect(session.phases.find((p) => p.id === 3)?.status).toBe('accepted');
  });
});

describe('PHASE_ARTIFACTS', () => {
  it('places 03-STRUCTURE.md under Phase 4, not Phase 3', () => {
    expect(PHASE_ARTIFACTS[3]).toEqual(['03-SCHEMAS.md']);
    expect(PHASE_ARTIFACTS[4]).toContain('03-STRUCTURE.md');
  });
});
