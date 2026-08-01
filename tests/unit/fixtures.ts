import type { MustardSession } from '../../src/schemas/session.js';

/**
 * A valid `MustardSession` factory for tests. Pass a partial to override any
 * top-level field. Keep this minimal-but-valid so schema and persistence tests
 * share one source of truth.
 */
export function makeSession(overrides: Partial<MustardSession> = {}): MustardSession {
  return {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 1,
    phases: [
      {
        id: 0,
        status: 'accepted',
        answers: [
          {
            questionId: 'p0.literacy',
            type: 'select',
            value: 'some',
            source: 'seed',
            askedAt: '2026-07-31T10:00:00.000Z',
          },
        ],
        followUpsAsked: 0,
        analysisRuns: 0,
        artifactPaths: [],
      },
    ],
    facts: { 'facts.actorCount': 1 },
    tasks: [],
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  };
}
