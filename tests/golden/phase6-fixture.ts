import { runPhase6 } from '../../src/engine/phase-6.js';
import type { RunnerIO } from '../../src/engine/runner.js';
import { buildPasses } from '../../src/llm/passes/index.js';
import type { FakeStep, LLMTransport } from '../../src/llm/transport.js';
import type { PhaseAnalysis } from '../../src/schemas/analysis.js';
import type { Phase5Output } from '../../src/schemas/architecture.js';
import type { ManifestoArtifact } from '../../src/schemas/manifesto.js';
import type { Sequence } from '../../src/schemas/roadmap.js';
import type { MustardSession } from '../../src/schemas/session.js';
import type { EditorLauncher } from '../../src/ui/editor.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { CLOCK, CONFIG } from './phase1-skeleton.js';
import { memoryIO } from './phase2b-fixture.js';
import { EXPECTED_PHASE4_OUTPUT, PHASE3_OUTPUT } from './phase4-fixture.js';
import { CANNED_ARCHITECTURE, PHASE5_PHASE2_OUTPUT, VERSION } from './phase5-fixture.js';

/**
 * Shared definition for Phase 6 (M13), golden project #1 continued. Holds the accepted
 * Phase 2/3/4/5 outputs, the canned `analyse` (one gap, to prove the capped follow-up)
 * and `sequence` responses, and the scripted answers — imported by both the fixture
 * recorder (`record-phase6.ts`) and the integration test (`tests/unit/phase6.test.ts`),
 * so record and replay compute identical fixture keys.
 *
 * The canned `sequence` deliberately lists its tasks OUT of dependency order, so the
 * deterministic `repairOrder` in `runPhase6` visibly sorts them — the "valid topological
 * ordering" rubric (§10) holding by construction, not by the model's good behaviour.
 */

/** The Phase 1 manifesto output — read only by Phase 7, carried here so the start session is reusable. */
export const PHASE1_MANIFESTO: ManifestoArtifact = {
  projectName: 'Habit Tracker',
  mission: 'Help one person build a daily habit and actually see their streak grow.',
  values: [
    { title: 'Ship before perfect', rationale: 'A used habit tracker beats a planned one.' },
  ],
  aiLaws: [
    'Write tests alongside every feature.',
    'Never add a dependency without asking.',
    'Keep functions small and named for what they do.',
  ],
};

/** The Phase 5 architecture output Phase 6 (and 7) read — built from the canned Phase 5 data. */
export const PHASE5_OUTPUT: Phase5Output = {
  componentGraph: CANNED_ARCHITECTURE.componentGraph,
  sequenceSelections: CANNED_ARCHITECTURE.sequenceSelections,
  selectedUseCases: PHASE5_PHASE2_OUTPUT.useCases,
  adrs: CANNED_ARCHITECTURE.adrs,
  irreversibleDecisions: CANNED_ARCHITECTURE.irreversibleDecisions,
  confirmations: [
    { decisionId: 'IRR-1', confirmed: true, confirmedAt: CLOCK() },
    { decisionId: 'IRR-2', confirmed: true, confirmedAt: CLOCK() },
    { decisionId: 'IRR-3', confirmed: false, confirmedAt: CLOCK() },
  ],
};

/** Canned ANALYSE result: a single important gap, to prove exactly one capped follow-up. */
export const CANNED_ANALYSIS_6: PhaseAnalysis = {
  gaps: [
    {
      id: 'g1',
      severity: 'important',
      description: 'The time budget does not say whether there is a hard launch deadline.',
      suggestedQuestion: 'Is there a date this needs to be usable by?',
      suggestedType: 'text',
    },
  ],
  contradictions: [],
  derivedFacts: [],
  readyToSynthesise: false,
};

/**
 * Canned sequence: five tasks listed OUT of dependency order (T003 before T002) so the
 * deterministic topo sort has visible work to do. Every `dependsOn` is honoured.
 */
export const CANNED_SEQUENCE: Sequence = {
  tasks: [
    {
      id: 'T001',
      title: 'Set up the project and CI',
      group: 'setup',
      useCaseIds: [],
      dependsOn: [],
      acceptanceCriteria: ['The app builds and the test runner passes on CI.'],
      filesTouched: ['package.json', 'tsconfig.json'],
    },
    {
      id: 'T003',
      title: 'Create a habit',
      group: 'feature',
      useCaseIds: ['uc1'],
      dependsOn: ['T002'],
      acceptanceCriteria: ['A signed-in member can create a habit with a name.'],
      filesTouched: ['src/habits/create.ts'],
    },
    {
      id: 'T002',
      title: 'Add email/password auth',
      group: 'auth',
      useCaseIds: [],
      dependsOn: ['T001'],
      acceptanceCriteria: ['A signed-out user is redirected to /login.'],
      filesTouched: ['src/auth/session.ts'],
    },
    {
      id: 'T004',
      title: 'Check in on a habit',
      group: 'feature',
      useCaseIds: ['uc2'],
      dependsOn: ['T003'],
      acceptanceCriteria: ['A member can mark a habit done for today exactly once.'],
      filesTouched: ['src/habits/checkin.ts'],
    },
    {
      id: 'T005',
      title: 'Polish the streak view',
      group: 'polish',
      useCaseIds: ['uc2'],
      dependsOn: ['T004'],
      acceptanceCriteria: ['The streak count is visible on the habit card.'],
      filesTouched: ['src/habits/streak.ts'],
    },
  ],
};

/** The ids in the deterministically-repaired build order (what `runPhase6` must produce). */
export const ORDERED_TASK_IDS = ['T001', 'T002', 'T003', 'T004', 'T005'] as const;

/** FakeTransport steps in the exact order runPhase6 calls the passes. */
export const FAKE_STEPS: FakeStep[] = [
  { kind: 'object', value: CANNED_ANALYSIS_6 }, // 1. analyse (ANALYSE)
  { kind: 'object', value: CANNED_SEQUENCE }, // 2. sequence (SYNTHESISE)
];

/** The two seed answers — deterministic so the analyse input hash is stable. */
const SEED_STEPS: ScriptedStep[] = [
  { kind: 'select', value: 'under-5' }, // p6.hours-per-week → roadmap.hoursPerWeek
  { kind: 'select', value: 'critical' }, // p6.testing-policy → roadmap.testingPolicy
];

/** The single capped follow-up answer (gap g1, a text prompt). */
const FOLLOWUP_STEPS: ScriptedStep[] = [
  { kind: 'text', value: 'No hard deadline — evenings only.' },
];

/** The single write-gate review (06-ROADMAP.md). */
const WRITE_STEPS: ScriptedStep[] = [{ kind: 'select', value: 'accept' }];

/** The full scripted run. */
export const FULL_6_SCRIPT: ScriptedStep[] = [...SEED_STEPS, ...FOLLOWUP_STEPS, ...WRITE_STEPS];

/** Cancel at the write review, after ANALYSE and SEQUENCE have already run. */
export const CANCEL_6_SCRIPT: ScriptedStep[] = [
  ...SEED_STEPS,
  ...FOLLOWUP_STEPS,
  { kind: 'cancel' },
];

/** Resume answers: just the write review, same value so keys still match. */
export const RESUME_6_SCRIPT: ScriptedStep[] = [...WRITE_STEPS];

/** A session sitting at the start of Phase 6: Phases 0–5 accepted, outputs present. */
export function phase6StartSession(): MustardSession {
  const ts = CLOCK();
  return {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 6,
    phases: [
      accepted(0, [], ts),
      {
        ...accepted(1, ['01-MANIFESTO.md', '01-AI-LAWS.md'], ts),
        synthesisedObject: PHASE1_MANIFESTO,
      },
      { ...accepted(2, ['02-USE-CASES.md'], ts), synthesisedObject: PHASE5_PHASE2_OUTPUT },
      { ...accepted(3, ['03-SCHEMAS.md'], ts), synthesisedObject: PHASE3_OUTPUT },
      {
        ...accepted(4, ['04-STACK.md', '03-STRUCTURE.md'], ts),
        synthesisedObject: EXPECTED_PHASE4_OUTPUT,
      },
      {
        ...accepted(5, ['05-ARCHITECTURE.md', '05-DECISIONS.md'], ts),
        synthesisedObject: PHASE5_OUTPUT,
      },
    ],
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

/** Run Phase 6 with a scripted prompter over the given transport. */
export async function runPhase6Scripted(opts: {
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
  const session = await runPhase6(opts.session ?? phase6StartSession(), {
    prompter,
    analyse: passes.analyse,
    sequence: passes.sequence,
    io,
    ...(opts.editor ? { editor: opts.editor } : {}),
    now: CLOCK,
    save,
    mustardVersion: VERSION,
  });
  return { session, prompter, writes: opts.io ? [] : mem.writes };
}
