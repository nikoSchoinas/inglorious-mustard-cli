import { runPhase5 } from '../../src/engine/phase-5.js';
import type { RunnerIO } from '../../src/engine/runner.js';
import { buildPasses } from '../../src/llm/passes/index.js';
import type { FakeStep, LLMTransport } from '../../src/llm/transport.js';
import type { PhaseAnalysis } from '../../src/schemas/analysis.js';
import type { Architecture } from '../../src/schemas/architecture.js';
import type { Phase2Output } from '../../src/schemas/phase2-output.js';
import type { MustardSession } from '../../src/schemas/session.js';
import type { EditorLauncher } from '../../src/ui/editor.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { CLOCK, CONFIG } from './phase1-skeleton.js';
import { memoryIO } from './phase2b-fixture.js';
import { EXPECTED_PHASE4_OUTPUT, PHASE3_OUTPUT } from './phase4-fixture.js';

/**
 * Shared definition for Phase 5 (M12), golden project #1 continued. Holds the confirmed
 * Phase 2/3/4 outputs, the canned `analyse` (one gap, to prove the capped follow-up) and
 * `synthesise-architecture` responses, and the scripted answers — imported by both the
 * fixture recorder (`record-phase5.ts`) and the integration test (`tests/unit/phase5.test.ts`),
 * so record and replay compute identical fixture keys.
 *
 * The irreversibility gate is scripted TWO confirmed, ONE declined, so the non-blocking
 * path (§M12) is exercised: the phase still advances and `05-DECISIONS.md` flags the
 * unconfirmed decision.
 */

/** Deterministic version for artifact frontmatter, so the snapshots are stable. */
export const VERSION = '0.0.0-test';

/** The Phase 2 output Phase 5 reads use cases from — two use cases so 2 flows can be drawn. */
export const PHASE5_PHASE2_OUTPUT: Phase2Output = {
  extraction: {
    actors: [
      { id: 'a1', name: 'Member', description: 'Someone building a daily habit', isPrimary: true },
    ],
    entities: [
      {
        id: 'e1',
        name: 'Habit',
        description: 'A habit being tracked',
        attributes: [{ name: 'title', type: 'string', required: true, isEnum: false }],
        relationships: [],
      },
    ],
    capabilities: [],
  },
  useCases: [
    {
      id: 'uc1',
      title: 'Create a habit',
      actorId: 'a1',
      preconditions: ['signed in'],
      happyPath: [
        { actor: 'user', action: 'fills in the habit form' },
        { actor: 'system', action: 'validates the input' },
        { actor: 'database', action: 'stores the new habit' },
      ],
      failurePaths: [
        { trigger: 'empty name', systemResponse: 'block the save', userVisible: 'asks for a name' },
        {
          trigger: 'database is down',
          systemResponse: 'retry then surface an error',
          userVisible: 'try again shortly',
        },
      ],
      dependsOn: [],
    },
    {
      id: 'uc2',
      title: 'Check in on a habit',
      actorId: 'a1',
      preconditions: ['a habit exists'],
      happyPath: [
        { actor: 'user', action: 'taps check in' },
        { actor: 'database', action: 'records today’s completion' },
      ],
      failurePaths: [
        {
          trigger: 'already checked in today',
          systemResponse: 'ignore the duplicate',
          userVisible: 'already done today',
        },
      ],
      dependsOn: ['uc1'],
    },
  ],
  dependencyOrder: ['uc1', 'uc2'],
  screens: { approach: 'sketch', screens: ['Create habit', 'Check in'] },
};

/** Canned ANALYSE result: a single important gap, to prove exactly one capped follow-up. */
export const CANNED_ANALYSIS: PhaseAnalysis = {
  gaps: [
    {
      id: 'g1',
      severity: 'important',
      description: 'The heavy-work answer does not say how big the exports are.',
      suggestedQuestion: 'Roughly how large is the biggest export a user might request?',
      suggestedType: 'text',
    },
  ],
  contradictions: [],
  derivedFacts: [],
  readyToSynthesise: false,
};

/** Canned architecture: a 3-node graph, two sequence selections, an ADR, three irreversibles. */
export const CANNED_ARCHITECTURE: Architecture = {
  componentGraph: {
    components: [
      { id: 'web', label: 'Next.js web app', category: 'frontend' },
      { id: 'api', label: 'API server', category: 'backend' },
      { id: 'db', label: 'PostgreSQL', category: 'database' },
    ],
    connections: [
      { from: 'web', to: 'api', label: 'HTTPS' },
      { from: 'api', to: 'db', label: 'reads/writes' },
    ],
  },
  sequenceSelections: [
    {
      useCaseId: 'uc1',
      failurePathCount: 2,
      crossComponentReach: 3,
      rationale: 'Creating a habit has the most failure paths and touches every component.',
    },
    {
      useCaseId: 'uc2',
      failurePathCount: 1,
      crossComponentReach: 2,
      rationale: 'Check-in is the highest-frequency flow, so its one failure path matters daily.',
    },
  ],
  adrs: [
    {
      id: 'ADR-001',
      title: 'Server-rendered monolith',
      status: 'accepted',
      context: 'A small habit tracker with modest scale and one primary actor.',
      decision: 'Run a single Next.js app with an integrated API rather than separate services.',
      consequences: 'Simplest to build and deploy; revisit only if scale demands separation.',
    },
  ],
  irreversibleDecisions: [
    {
      id: 'IRR-1',
      title: 'Authentication model',
      plainLanguage: 'People sign in with an email and password you store yourself.',
      consequence: 'Switching to Google/Apple sign-in later means migrating every account.',
    },
    {
      id: 'IRR-2',
      title: 'Relational data model',
      plainLanguage: 'Habits and check-ins live in tables with fixed columns.',
      consequence: 'Reshaping to a document store later is a full data migration.',
    },
    {
      id: 'IRR-3',
      title: 'Single-region hosting',
      plainLanguage: 'Everything runs in one region close to your first users.',
      consequence: 'Going multi-region later means re-architecting data residency.',
    },
  ],
};

/** FakeTransport steps in the exact order runPhase5 calls the passes. */
export const FAKE_STEPS: FakeStep[] = [
  { kind: 'object', value: CANNED_ANALYSIS }, // 1. analyse (ANALYSE)
  { kind: 'object', value: CANNED_ARCHITECTURE }, // 2. synthesise-architecture (SYNTHESISE)
];

/** The two seed answers — deterministic, so the synthesis input hash is stable. */
const SEED_STEPS: ScriptedStep[] = [
  { kind: 'select', value: 'server' }, // p5.heavy-work → arch.heavyWork
  { kind: 'confirm', value: true }, // p5.data-sharing → arch.dataSharing
];

/** The single capped follow-up answer (gap g1, a text prompt). */
const FOLLOWUP_STEPS: ScriptedStep[] = [{ kind: 'text', value: 'At most a few megabytes.' }];

/** The three irreversibility confirms: two locked in, one declined (non-blocking path). */
const IRR_STEPS: ScriptedStep[] = [
  { kind: 'confirm', value: true }, // IRR-1
  { kind: 'confirm', value: true }, // IRR-2
  { kind: 'confirm', value: false }, // IRR-3 declined
];

/** The two write-gate reviews (05-ARCHITECTURE.md, then 05-DECISIONS.md). */
const WRITE_STEPS: ScriptedStep[] = [
  { kind: 'select', value: 'accept' },
  { kind: 'select', value: 'accept' },
];

/** The full scripted run. */
export const FULL_5_SCRIPT: ScriptedStep[] = [
  ...SEED_STEPS,
  ...FOLLOWUP_STEPS,
  ...IRR_STEPS,
  ...WRITE_STEPS,
];

/** Cancel at the irreversibility gate, after the first two decisions are confirmed. */
export const CANCEL_5_SCRIPT: ScriptedStep[] = [
  ...SEED_STEPS,
  ...FOLLOWUP_STEPS,
  { kind: 'confirm', value: true }, // IRR-1
  { kind: 'confirm', value: true }, // IRR-2
  { kind: 'cancel' }, // Ctrl-C confirming IRR-3
];

/** Resume answers: the remaining confirm + writes, identical values so keys still match. */
export const RESUME_5_SCRIPT: ScriptedStep[] = [
  { kind: 'confirm', value: false }, // IRR-3 declined
  ...WRITE_STEPS,
];

/** A session sitting at the start of Phase 5: Phases 0–4 accepted, outputs present. */
export function phase5StartSession(): MustardSession {
  const ts = CLOCK();
  return {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 5,
    phases: [
      accepted(0, [], ts),
      accepted(1, ['01-MANIFESTO.md', '01-AI-LAWS.md'], ts),
      { ...accepted(2, ['02-USE-CASES.md'], ts), synthesisedObject: PHASE5_PHASE2_OUTPUT },
      { ...accepted(3, ['03-SCHEMAS.md'], ts), synthesisedObject: PHASE3_OUTPUT },
      {
        ...accepted(4, ['04-STACK.md', '03-STRUCTURE.md'], ts),
        synthesisedObject: EXPECTED_PHASE4_OUTPUT,
      },
    ],
    // The derived needs.*/context.* facts Phase 4 left behind, read by the synthesis input.
    facts: {
      actorCount: 1,
      'needs.objectStorage': true,
      'needs.auth': 'email-password',
      'needs.payments': false,
      'context.runTarget': 'web',
      'context.scale': 'hundreds',
      'context.sensitivity': 'personal',
    },
    factSources: {
      actorCount: 'derived',
      'needs.objectStorage': 'answer',
      'needs.auth': 'answer',
      'needs.payments': 'answer',
      'context.runTarget': 'answer',
      'context.scale': 'answer',
      'context.sensitivity': 'answer',
    },
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

function accepted(
  id: number,
  artifactPaths: string[],
  ts: string,
): MustardSession['phases'][number] {
  return {
    id,
    status: 'accepted',
    answers: [],
    followUpsAsked: 0,
    analysisRuns: 0,
    artifactPaths,
    edited: false,
    acceptedAt: ts,
  };
}

/** Run Phase 5 with a scripted prompter over the given transport. */
export async function runPhase5Scripted(opts: {
  transport: LLMTransport;
  script: ScriptedStep[];
  session?: MustardSession;
  save?: (s: MustardSession) => MustardSession;
  io?: RunnerIO;
  editor?: EditorLauncher;
}): Promise<{
  session: MustardSession;
  prompter: ScriptedPrompter;
  writes: Array<{ name: string; body: string }>;
}> {
  const prompter = new ScriptedPrompter(opts.script);
  const passes = buildPasses(CONFIG, { transport: opts.transport, apiKey: 'dummy', now: CLOCK });
  const mem = memoryIO();
  const io = opts.io ?? mem.io;
  const save = opts.save ?? ((s: MustardSession) => s);
  const session = await runPhase5(opts.session ?? phase5StartSession(), {
    prompter,
    analyse: passes.analyse,
    synthesiseArchitecture: passes.synthesiseArchitecture,
    io,
    ...(opts.editor ? { editor: opts.editor } : {}),
    now: CLOCK,
    save,
    mustardVersion: VERSION,
  });
  return { session, prompter, writes: opts.io ? [] : mem.writes };
}
