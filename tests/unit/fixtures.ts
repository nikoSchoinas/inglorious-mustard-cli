import type { ComponentGraph } from '../../src/render/mermaid/component.js';
import type { DomainExtraction } from '../../src/schemas/extraction.js';
import type { MustardSession } from '../../src/schemas/session.js';
import type { StackDecision } from '../../src/schemas/stack.js';
import type { UseCase } from '../../src/schemas/use-case.js';

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
    facts: { actorCount: 1 },
    tasks: [],
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * A `DomainExtraction` exercising all three cardinalities plus an `ambiguous`
 * relationship, for the ER renderer tests.
 */
export function makeDomainExtraction(overrides: Partial<DomainExtraction> = {}): DomainExtraction {
  return {
    actors: [{ id: 'a1', name: 'Member', description: 'A signed-in user', isPrimary: true }],
    entities: [
      {
        id: 'e1',
        name: 'User',
        description: 'An account holder',
        attributes: [
          { name: 'email', type: 'string', required: true, isEnum: false },
          { name: 'status', type: 'string', required: true, isEnum: true },
        ],
        relationships: [
          { toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' },
          { toEntityId: 'e3', cardinality: 'one_to_one', confidence: 'ambiguous' },
        ],
      },
      {
        id: 'e2',
        name: 'Habit',
        description: 'A tracked habit',
        attributes: [{ name: 'title', type: 'string', required: true, isEnum: false }],
        relationships: [{ toEntityId: 'e3', cardinality: 'many_to_many', confidence: 'high' }],
      },
      {
        id: 'e3',
        name: 'Tag',
        description: 'A label',
        attributes: [],
        relationships: [],
      },
    ],
    capabilities: [
      { id: 'c1', actorId: 'a1', verb: 'track', object: 'Habit', description: 'log a habit' },
    ],
    ...overrides,
  };
}

/** A `UseCase` with all four happy-path actor kinds and a failure path. */
export function makeUseCase(overrides: Partial<UseCase> = {}): UseCase {
  return {
    id: 'uc1',
    title: 'Log a habit',
    actorId: 'a1',
    preconditions: ['User is signed in'],
    happyPath: [
      { actor: 'user', action: 'taps "mark done"' },
      { actor: 'system', action: 'validates the request' },
      { actor: 'database', action: 'writes the log entry' },
      { actor: 'external', action: 'sends a push notification' },
    ],
    failurePaths: [
      {
        trigger: 'The push notification service is down',
        systemResponse: 'Queue the notification for retry',
        userVisible: 'Nothing — the log still succeeds',
      },
    ],
    dependsOn: [],
    ...overrides,
  };
}

/** Two `StackDecision`s for the component-from-stack adapter test. */
export function makeStackDecisions(): StackDecision[] {
  return [
    {
      componentId: 'fe',
      category: 'frontend',
      choice: 'Next.js',
      justification: 'Popular, well-documented, good agent support.',
      alternatives: [
        { name: 'Remix', tradeoff: 'Smaller ecosystem' },
        { name: 'SvelteKit', tradeoff: 'Less mainstream' },
      ],
      locked: false,
    },
    {
      componentId: 'db',
      category: 'database',
      choice: 'Postgres',
      justification: 'Battle-tested relational store.',
      alternatives: [
        { name: 'MySQL', tradeoff: 'Fewer features' },
        { name: 'SQLite', tradeoff: 'Single-writer' },
      ],
      locked: false,
    },
  ];
}

/** A `ComponentGraph` with real edges for the component renderer test. */
export function makeComponentGraph(overrides: Partial<ComponentGraph> = {}): ComponentGraph {
  return {
    nodes: [
      { id: 'web', label: 'Web App', category: 'frontend' },
      { id: 'api', label: 'API Server', category: 'backend' },
      { id: 'db', label: 'Postgres', category: 'database' },
    ],
    edges: [
      { from: 'web', to: 'api', label: 'HTTPS' },
      { from: 'api', to: 'db' },
    ],
    ...overrides,
  };
}
