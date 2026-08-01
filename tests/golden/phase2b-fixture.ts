import { runPhase2B } from '../../src/engine/phase-2b.js';
import type { RunnerIO } from '../../src/engine/runner.js';
import type { FailureQuestion } from '../../src/llm/passes/failure-questions.js';
import type { FailurePath } from '../../src/llm/passes/failure-structure.js';
import type { HappyStep } from '../../src/llm/passes/happy-path.js';
import { buildPasses } from '../../src/llm/passes/index.js';
import type { FakeStep } from '../../src/llm/transport.js';
import type { LLMTransport } from '../../src/llm/transport.js';
import type { DomainExtraction } from '../../src/schemas/extraction.js';
import type { MustardSession } from '../../src/schemas/session.js';
import type { EditorLauncher } from '../../src/ui/editor.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { CLOCK, CONFIG } from './phase1-skeleton.js';
import { CAPTURE } from './phase2a-fixture.js';

/**
 * Shared definition for Phase 2B (M9), golden project #1 continued. One place holds
 * the confirmed part-A extraction, the canned happy-path / failure / order responses,
 * and the scripted answers — imported by both the fixture recorder
 * (`record-phase2b.ts`) and the integration test (`tests/unit/phase2b.test.ts`), so
 * record and replay compute identical fixture keys.
 */

/** Deterministic version for artifact frontmatter, so `02-USE-CASES.md` snapshots are stable. */
export const VERSION = '0.0.0-test';

/**
 * The confirmed extraction part A (M8) leaves in `synthesisedObject`: one actor,
 * three entities, three capabilities (create/check-in/reminder). Part B turns each
 * capability into a use case (uc1..uc3).
 */
export const CONFIRMED_EXTRACTION: DomainExtraction = {
  actors: [
    { id: 'a1', name: 'Member', description: 'Someone building a daily habit', isPrimary: true },
  ],
  entities: [
    {
      id: 'e1',
      name: 'Habit',
      description: 'A habit being tracked',
      attributes: [{ name: 'title', type: 'string', required: true, isEnum: false }],
      relationships: [{ toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' }],
    },
    {
      id: 'e2',
      name: 'CheckIn',
      description: 'A daily completion record',
      attributes: [{ name: 'date', type: 'date', required: true, isEnum: false }],
      relationships: [],
    },
    { id: 'e3', name: 'Streak', description: '', attributes: [], relationships: [] },
  ],
  capabilities: [
    { id: 'c1', actorId: 'a1', verb: 'create', object: 'habit', description: 'add a habit' },
    { id: 'c2', actorId: 'a1', verb: 'check in', object: 'habit', description: 'mark it done' },
    { id: 'c3', actorId: 'a1', verb: 'set a reminder', object: '', description: 'set a reminder' },
  ],
};

/** The use-case ids part B seeds, in order. */
export const UC_IDS = ['uc1', 'uc2', 'uc3'] as const;

/** Canned happy paths per use case (in seed order). */
export const CANNED_HAPPY: Record<string, HappyStep[]> = {
  uc1: [
    { actor: 'user', action: 'taps New Habit and enters a name' },
    { actor: 'system', action: 'validates the name' },
    { actor: 'database', action: 'stores the new habit' },
    { actor: 'user', action: 'sees the habit in their list' },
  ],
  uc2: [
    { actor: 'user', action: 'opens a habit and taps Done for today' },
    { actor: 'system', action: 'records the check-in' },
    { actor: 'database', action: 'saves the check-in' },
  ],
  uc3: [
    { actor: 'user', action: 'opens a habit and sets a reminder time' },
    { actor: 'system', action: 'schedules the reminder' },
    { actor: 'external', action: 'sends a notification at the set time' },
  ],
};

/** Canned failure questions per use case (2 each). */
export const CANNED_FAILQ: Record<string, FailureQuestion[]> = {
  uc1: [
    { trigger: 'duplicate name', question: 'What if they create a habit they already have?' },
    { trigger: 'empty name', question: 'What if they leave the habit name blank?' },
  ],
  uc2: [
    { trigger: 'double check-in', question: 'What if they mark the same habit done twice today?' },
    { trigger: 'offline', question: 'What if they have no internet when they check in?' },
  ],
  uc3: [
    { trigger: 'notification fails', question: 'What if the reminder fails to send?' },
    { trigger: 'past time', question: 'What if they set a reminder for a time already gone?' },
  ],
};

/** Canned structured failure paths per use case (one per question). */
export const CANNED_FAILSTRUCT: Record<string, FailurePath[]> = {
  uc1: [
    {
      trigger: 'duplicate name',
      systemResponse: 'reject the duplicate',
      userVisible: 'a message that the habit already exists',
    },
    {
      trigger: 'empty name',
      systemResponse: 'block the save',
      userVisible: 'a validation error asking for a name',
    },
  ],
  uc2: [
    {
      trigger: 'double check-in',
      systemResponse: 'ignore the second check-in',
      userVisible: 'the habit shown as already done today',
    },
    {
      trigger: 'offline',
      systemResponse: 'queue the check-in and sync later',
      userVisible: 'a note that it will sync when back online',
    },
  ],
  uc3: [
    {
      trigger: 'notification fails',
      systemResponse: 'retry once, then log it',
      userVisible: 'nothing — the reminder is best-effort',
    },
    {
      trigger: 'past time',
      systemResponse: 'schedule it for the next day',
      userVisible: 'a note that the reminder starts tomorrow',
    },
  ],
};

/** Canned build order, as titles (§8.5 step 7). */
export const CANNED_ORDER = ['create habit', 'check in habit', 'set a reminder'];

/** The user's free-text failure answers, per use case (2 each), matching CANNED_FAILQ. */
export const FAIL_ANSWERS: Record<string, [string, string]> = {
  uc1: ['show a message that it already exists', 'ask them to enter a name'],
  uc2: ['show it as already done', 'save it and sync later'],
  uc3: ['retry quietly', 'start it tomorrow'],
};

/** The chosen screens (from the derived candidates) for the full run. */
export const CHOSEN_SCREENS = ['Create habit', 'Sign in'];

/**
 * The FakeTransport steps in the exact order `runPhase2B` calls the passes: all three
 * happy paths, then per use case (failure-questions → failure-structure), then order.
 */
export const FAKE_STEPS: FakeStep[] = [
  { kind: 'object', value: CANNED_HAPPY.uc1 },
  { kind: 'object', value: CANNED_HAPPY.uc2 },
  { kind: 'object', value: CANNED_HAPPY.uc3 },
  { kind: 'object', value: CANNED_FAILQ.uc1 },
  { kind: 'object', value: CANNED_FAILSTRUCT.uc1 },
  { kind: 'object', value: CANNED_FAILQ.uc2 },
  { kind: 'object', value: CANNED_FAILSTRUCT.uc2 },
  { kind: 'object', value: CANNED_FAILQ.uc3 },
  { kind: 'object', value: CANNED_FAILSTRUCT.uc3 },
  { kind: 'object', value: CANNED_ORDER },
];

/** The full scripted run: accept every happy path, answer every failure question,
 * confirm the order, choose a UI approach and screens, accept the artifact. */
export const FULL_2B_SCRIPT: ScriptedStep[] = [
  { kind: 'select', value: 'accept' }, // happy uc1
  { kind: 'select', value: 'accept' }, // happy uc2
  { kind: 'select', value: 'accept' }, // happy uc3
  { kind: 'text', value: FAIL_ANSWERS.uc1[0] }, // uc1 q1
  { kind: 'text', value: FAIL_ANSWERS.uc1[1] }, // uc1 q2
  { kind: 'text', value: FAIL_ANSWERS.uc2[0] }, // uc2 q1
  { kind: 'text', value: FAIL_ANSWERS.uc2[1] }, // uc2 q2
  { kind: 'text', value: FAIL_ANSWERS.uc3[0] }, // uc3 q1
  { kind: 'text', value: FAIL_ANSWERS.uc3[1] }, // uc3 q2
  { kind: 'confirm', value: true }, // build order
  { kind: 'select', value: 'sketch' }, // p2.ui.approach
  { kind: 'multiselect', value: CHOSEN_SCREENS }, // screens
  { kind: 'text', value: '' }, // custom screens → none
  { kind: 'select', value: 'accept' }, // review 02-USE-CASES.md
];

/** Cancel after all happy paths and uc1's failure interrogation, before uc2's. */
export const CANCEL_2B_SCRIPT: ScriptedStep[] = [
  { kind: 'select', value: 'accept' }, // happy uc1
  { kind: 'select', value: 'accept' }, // happy uc2
  { kind: 'select', value: 'accept' }, // happy uc3
  { kind: 'text', value: FAIL_ANSWERS.uc1[0] }, // uc1 q1
  { kind: 'text', value: FAIL_ANSWERS.uc1[1] }, // uc1 q2 → uc1 done
  { kind: 'cancel' }, // Ctrl-C at uc2's first failure question
];

/** The remaining answers on resume — identical values, so fixture keys still match. */
export const RESUME_2B_SCRIPT: ScriptedStep[] = [
  { kind: 'text', value: FAIL_ANSWERS.uc2[0] }, // uc2 q1 (failure-questions uc2 re-runs)
  { kind: 'text', value: FAIL_ANSWERS.uc2[1] }, // uc2 q2
  { kind: 'text', value: FAIL_ANSWERS.uc3[0] }, // uc3 q1
  { kind: 'text', value: FAIL_ANSWERS.uc3[1] }, // uc3 q2
  { kind: 'confirm', value: true },
  { kind: 'select', value: 'sketch' },
  { kind: 'multiselect', value: CHOSEN_SCREENS },
  { kind: 'text', value: '' },
  { kind: 'select', value: 'accept' },
];

/** A session sitting at the start of Phase 2 part B: part A confirmed, phase in progress. */
export function phase2bStartSession(): MustardSession {
  const ts = CLOCK();
  return {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 2,
    phases: [
      {
        id: 0,
        status: 'accepted',
        answers: [],
        followUpsAsked: 0,
        analysisRuns: 0,
        artifactPaths: [],
        edited: false,
        acceptedAt: ts,
      },
      {
        id: 1,
        status: 'accepted',
        answers: [],
        followUpsAsked: 0,
        analysisRuns: 0,
        artifactPaths: ['01-MANIFESTO.md', '01-AI-LAWS.md'],
        edited: false,
        acceptedAt: ts,
      },
      {
        id: 2,
        status: 'in_progress',
        answers: [
          { questionId: 'p2.capture', type: 'editor', value: CAPTURE, source: 'seed', askedAt: ts },
        ],
        followUpsAsked: 0,
        analysisRuns: 0,
        artifactPaths: [],
        edited: false,
        synthesisedObject: CONFIRMED_EXTRACTION,
      },
    ],
    facts: { actorCount: 1 },
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** An in-memory artifact writer, so tests never write into the repo's `mustard/` dir. */
export function memoryIO(): { io: RunnerIO; writes: Array<{ name: string; body: string }> } {
  const writes: Array<{ name: string; body: string }> = [];
  return {
    io: {
      writeArtifact(name, body) {
        writes.push({ name, body });
      },
    },
    writes,
  };
}

/** Run Phase 2B with a scripted prompter over the given transport. */
export async function runPhase2BScripted(opts: {
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
  const session = await runPhase2B(opts.session ?? phase2bStartSession(), {
    prompter,
    happyPath: passes.happyPath,
    failureQuestions: passes.failureQuestions,
    failureStructure: passes.failureStructure,
    orderUseCases: passes.orderUseCases,
    io,
    ...(opts.editor ? { editor: opts.editor } : {}),
    now: CLOCK,
    save,
    mustardVersion: VERSION,
  });
  return { session, prompter, writes: opts.io ? [] : mem.writes };
}
