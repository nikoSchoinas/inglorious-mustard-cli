import { describe, expect, it } from 'vitest';
// A clean import of the barrel proves the schema module graph is acyclic and
// compiles under verbatimModuleSyntax.
import {
  Answer,
  DomainExtraction,
  Literacy,
  MustardConfig,
  MustardSession,
  PhaseState,
  StackDecision,
  Task,
  UseCase,
} from '../../src/schemas/index.js';
import { makeSession } from './fixtures.js';

describe('session schemas', () => {
  it('parses a valid session', () => {
    expect(() => MustardSession.parse(makeSession())).not.toThrow();
  });

  it('rejects an unknown literacy value', () => {
    expect(Literacy.safeParse('expert').success).toBe(false);
    expect(Literacy.safeParse('none').success).toBe(true);
  });

  it('rejects a phase id outside 0–7', () => {
    const base = {
      status: 'pending' as const,
      answers: [],
    };
    expect(PhaseState.safeParse({ id: 8, ...base }).success).toBe(false);
    expect(PhaseState.safeParse({ id: -1, ...base }).success).toBe(false);
    expect(PhaseState.safeParse({ id: 0, ...base }).success).toBe(true);
  });

  it('rejects a non-datetime askedAt', () => {
    const base = {
      questionId: 'q1',
      type: 'text' as const,
      value: 'hello',
      source: 'seed' as const,
    };
    expect(Answer.safeParse({ ...base, askedAt: 'not-a-date' }).success).toBe(false);
    expect(Answer.safeParse({ ...base, askedAt: '2026-07-31T10:00:00.000Z' }).success).toBe(true);
  });

  it('accepts every Answer.value union member', () => {
    const base = {
      questionId: 'q1',
      type: 'text' as const,
      source: 'seed' as const,
      askedAt: '2026-07-31T10:00:00.000Z',
    };
    for (const value of ['a string', 42, ['a', 'b'], true]) {
      expect(Answer.safeParse({ ...base, value }).success).toBe(true);
    }
  });

  it('materialises defaults on parse', () => {
    const phase = PhaseState.parse({ id: 1, status: 'pending', answers: [] });
    expect(phase.followUpsAsked).toBe(0);
    expect(phase.analysisRuns).toBe(0);
    expect(phase.artifactPaths).toEqual([]);
    // M5 additive fields default to their unedited/absent state.
    expect(phase.edited).toBe(false);
    expect(phase.synthesisedObject).toBeUndefined();

    const session = MustardSession.parse({
      schemaVersion: 1,
      projectName: 'x',
      literacy: 'none',
      agentTarget: 'undecided',
      currentPhase: 0,
      phases: [],
      createdAt: '2026-07-31T10:00:00.000Z',
      updatedAt: '2026-07-31T10:00:00.000Z',
    });
    expect(session.facts).toEqual({});
    expect(session.tasks).toEqual([]);
  });

  it('round-trips every facts value union member, including multiselect arrays', () => {
    const facts = {
      'manifesto.rules': ['ship-before-perfect', 'write-my-own'],
      'needs.objectStorage': true,
      actorCount: 3,
      literacy: 'some',
    };
    const session = MustardSession.parse(makeSession({ facts }));
    expect(session.facts).toEqual(facts);
  });

  it('rejects a schemaVersion other than 1', () => {
    expect(MustardSession.safeParse(makeSession({ schemaVersion: 2 as never })).success).toBe(
      false,
    );
  });
});

describe('pass-contract schemas', () => {
  it('requires exactly two stack alternatives', () => {
    const base = {
      componentId: 'db',
      category: 'database' as const,
      choice: 'Postgres',
      justification: 'It is the boring, well-documented default.',
    };
    const two = [
      { name: 'SQLite', tradeoff: 'no network access' },
      { name: 'MySQL', tradeoff: 'weaker JSON support' },
    ];
    expect(StackDecision.safeParse({ ...base, alternatives: two }).success).toBe(true);
    expect(StackDecision.safeParse({ ...base, alternatives: two.slice(0, 1) }).success).toBe(false);
  });

  it('requires at least one acceptance criterion on a task', () => {
    const base = {
      id: 'T001',
      title: 'Set up the project',
      group: 'setup' as const,
      useCaseIds: [],
      dependsOn: [],
      filesTouched: [],
    };
    expect(Task.safeParse({ ...base, acceptanceCriteria: ['compiles'] }).success).toBe(true);
    expect(Task.safeParse({ ...base, acceptanceCriteria: [] }).success).toBe(false);
  });

  it('parses a domain extraction with an ambiguous relationship', () => {
    const result = DomainExtraction.safeParse({
      actors: [{ id: 'a1', name: 'User', description: 'the person', isPrimary: true }],
      entities: [
        {
          id: 'e1',
          name: 'Order',
          description: 'a purchase',
          attributes: [{ name: 'total', type: 'number', required: true, isEnum: false }],
          relationships: [
            { toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'ambiguous' },
          ],
        },
      ],
      capabilities: [
        { id: 'c1', actorId: 'a1', verb: 'place', object: 'order', description: 'buy things' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('parses a use case with a failure path', () => {
    const result = UseCase.safeParse({
      id: 'uc1',
      title: 'Check out',
      actorId: 'a1',
      preconditions: ['signed in'],
      happyPath: [{ actor: 'user', action: 'pays' }],
      failurePaths: [
        { trigger: 'email fails', systemResponse: 'retry queue', userVisible: 'order confirmed' },
      ],
      dependsOn: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('config schema', () => {
  it('parses a valid config and defaults telemetry off', () => {
    const config = MustardConfig.parse({
      provider: 'anthropic',
      models: { fast: 'a-fast-id', deep: 'a-deep-id' },
      apiKeySource: 'env',
    });
    expect(config.telemetry).toBe(false);
  });

  it('rejects empty model ids', () => {
    expect(
      MustardConfig.safeParse({
        provider: 'anthropic',
        models: { fast: '', deep: 'x' },
        apiKeySource: 'env',
      }).success,
    ).toBe(false);
  });
});
