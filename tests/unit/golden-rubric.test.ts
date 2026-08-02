import { describe, expect, it } from 'vitest';
import type { Phase2Output } from '../../src/schemas/phase2-output.js';
import type { Phase6Output } from '../../src/schemas/roadmap.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import type { Phase4Output } from '../../src/schemas/stack.js';
import type { GoldenBundle } from '../golden/bundle.js';
import {
  actorCoverage,
  aiLawsWithinCap,
  failurePathCoverage,
  needsSatisfiedByStack,
  roadmapTopology,
  runRubric,
} from '../golden/rubric.js';

/**
 * M15 regression tripwire (technical-plan §5), proved OFFLINE. A well-formed bundle
 * passes every deterministic rubric line; a deliberately vandalized bundle (a use case
 * with no failure path, a roadmap cycle, an unmet need) fails exactly the matching line.
 * Zero tokens — this is the "a deliberately vandalized … causes a visible … drop" proof
 * that runs in ordinary `pnpm test`, with the LLM judge reserved for the nightly job.
 */

const TS = '2026-08-01T00:00:00.000Z';

function accepted(id: number, synthesisedObject: unknown): PhaseState {
  return {
    id,
    status: 'accepted',
    answers: [],
    followUpsAsked: 0,
    analysisRuns: 0,
    artifactPaths: [],
    edited: false,
    acceptedAt: TS,
    ...(synthesisedObject === undefined ? {} : { synthesisedObject }),
  } as PhaseState;
}

/** A coherent, rubric-passing habit-tracker bundle assembled by hand. */
function goodBundle(): GoldenBundle {
  const phase2 = {
    extraction: {
      actors: [{ id: 'a1', name: 'Member', description: 'Builds a habit', isPrimary: true }],
      entities: [],
      capabilities: [],
    },
    useCases: [
      {
        id: 'uc1',
        title: 'Create a habit',
        actorId: 'a1',
        preconditions: [],
        happyPath: [{ actor: 'user', action: 'adds a habit' }],
        failurePaths: [
          {
            trigger: 'empty name',
            systemResponse: 'block the save',
            userVisible: 'asks for a name',
          },
        ],
        dependsOn: [],
      },
      {
        id: 'uc2',
        title: 'Check in',
        actorId: 'a1',
        preconditions: [],
        happyPath: [{ actor: 'user', action: 'taps done' }],
        failurePaths: [{ trigger: 'twice', systemResponse: 'ignore', userVisible: 'already done' }],
        dependsOn: ['uc1'],
      },
    ],
    dependencyOrder: ['uc1', 'uc2'],
    screens: { approach: 'sketch', screens: ['Create habit'] },
  };
  const phase4 = {
    decisions: [
      {
        componentId: 'storage',
        category: 'storage',
        choice: 'Amazon S3',
        justification: 'Durable object storage for uploads.',
        alternatives: [
          { name: 'R2', tradeoff: 'No egress fees.' },
          { name: 'Supabase Storage', tradeoff: 'Bundled.' },
        ],
        locked: false,
      },
      {
        componentId: 'auth',
        category: 'auth',
        choice: 'Clerk',
        justification: 'Hosted sign-in.',
        alternatives: [
          { name: 'Auth.js', tradeoff: 'More wiring.' },
          { name: 'Supabase Auth', tradeoff: 'Bundled.' },
        ],
        locked: false,
      },
    ],
    structure: [{ name: 'package.json', kind: 'file' }],
  };
  const phase6 = {
    orderedTasks: [
      {
        id: 'T001',
        title: 'Setup',
        group: 'setup',
        useCaseIds: [],
        dependsOn: [],
        acceptanceCriteria: ['builds'],
        filesTouched: ['package.json'],
        status: 'todo',
      },
      {
        id: 'T002',
        title: 'Create habit',
        group: 'feature',
        useCaseIds: ['uc1'],
        dependsOn: ['T001'],
        acceptanceCriteria: ['can create'],
        filesTouched: ['src/create.ts'],
        status: 'todo',
      },
    ],
    hoursPerWeek: 'under-5',
    testingPolicy: 'critical',
  };
  const session: MustardSession = {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 8,
    phases: [accepted(2, phase2), accepted(4, phase4), accepted(6, phase6)],
    facts: { 'needs.objectStorage': true, 'needs.auth': 'email-password', 'needs.payments': false },
    factSources: {},
    tasks: phase6.orderedTasks,
    createdAt: TS,
    updatedAt: TS,
  } as MustardSession;

  return {
    session,
    artifacts: { '01-AI-LAWS.md': '# AI Laws\n\n- Write tests alongside every feature.\n' },
  };
}

describe('deterministic rubric — passing bundle', () => {
  it('passes every line for a coherent habit-tracker bundle', () => {
    const lines = runRubric(goodBundle());
    for (const line of lines) {
      expect(line, `${line.id}: ${line.detail}`).toMatchObject({ passed: true });
    }
  });
});

/** Typed, throwing accessor for a phase's synthesised object (no `!`, no `any`). */
function synthOf<T>(bundle: GoldenBundle, phaseId: number): T {
  const ps = bundle.session.phases.find((p) => p.id === phaseId);
  if (ps?.synthesisedObject === undefined) {
    throw new Error(`no synthesised object for phase ${phaseId}`);
  }
  return ps.synthesisedObject as T;
}

describe('deterministic rubric — vandalized bundles fail the matching line', () => {
  it('fails failure-path coverage when a use case loses its failure paths', () => {
    const bundle = goodBundle();
    synthOf<Phase2Output>(bundle, 2).useCases[1].failurePaths = [];
    const line = failurePathCoverage(bundle);
    expect(line.passed).toBe(false);
    expect(line.detail).toContain('Check in');
  });

  it('fails topology when the roadmap lists a task before its dependency', () => {
    const bundle = goodBundle();
    synthOf<Phase6Output>(bundle, 6).orderedTasks.reverse();
    const line = roadmapTopology(bundle);
    expect(line.passed).toBe(false);
  });

  it('fails needs→stack when an active need has no matching stack category', () => {
    const bundle = goodBundle();
    // Drop the storage decision while `needs.objectStorage` stays true.
    const phase4 = synthOf<Phase4Output>(bundle, 4);
    phase4.decisions = phase4.decisions.filter((d) => d.category !== 'storage');
    const line = needsSatisfiedByStack(bundle);
    expect(line.passed).toBe(false);
    expect(line.detail).toContain('storage');
  });

  it('fails the actor line when an actor has no use case', () => {
    const bundle = goodBundle();
    synthOf<Phase2Output>(bundle, 2).extraction.actors.push({
      id: 'a2',
      name: 'Coach',
      description: 'Reviews progress',
      isPrimary: false,
    });
    const line = actorCoverage(bundle);
    expect(line.passed).toBe(false);
    expect(line.detail).toContain('Coach');
  });

  it('fails the AI-LAWS cap when the file exceeds 200 lines', () => {
    const bundle = goodBundle();
    bundle.artifacts['01-AI-LAWS.md'] = Array.from({ length: 250 }, (_, i) => `- law ${i}`).join(
      '\n',
    );
    const line = aiLawsWithinCap(bundle);
    expect(line.passed).toBe(false);
    expect(line.detail).toContain('250');
  });
});
