import { runPhase3 } from '../../src/engine/phase-3.js';
import type { RunnerIO } from '../../src/engine/runner.js';
import { buildPasses } from '../../src/llm/passes/index.js';
import type { FakeStep, LLMTransport } from '../../src/llm/transport.js';
import type { DomainExtraction } from '../../src/schemas/extraction.js';
import type { Phase2Output } from '../../src/schemas/phase2-output.js';
import type { MustardSession } from '../../src/schemas/session.js';
import type { EditorLauncher } from '../../src/ui/editor.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { CLOCK, CONFIG } from './phase1-skeleton.js';
import { memoryIO } from './phase2b-fixture.js';

/**
 * Shared definition for Phase 3 (M10), golden project #1 continued. Holds the confirmed
 * Phase 2 output, the canned enum-value proposal, and the scripted answers — imported by
 * both the fixture recorder (`record-phase3.ts`) and the integration test
 * (`tests/unit/phase3.test.ts`), so record and replay compute identical fixture keys.
 *
 * The habit-tracker extraction is tailored here so Phase 3 has something to disambiguate:
 * `Habit.status` is an enum with no values, and `Habit → CheckIn` is an `ambiguous`
 * relationship. Everything else the schema needs is derived deterministically.
 */

/** Deterministic version for artifact frontmatter, so `03-SCHEMAS.md` snapshots are stable. */
export const VERSION = '0.0.0-test';

/**
 * The confirmed extraction Phase 2 leaves in `synthesisedObject`, with exactly one enum
 * attribute (`Habit.status`) and one ambiguous relationship (`Habit → CheckIn`).
 */
export const PHASE3_EXTRACTION: DomainExtraction = {
  actors: [
    { id: 'a1', name: 'Member', description: 'Someone building a daily habit', isPrimary: true },
  ],
  entities: [
    {
      id: 'e1',
      name: 'Habit',
      description: 'A habit being tracked',
      attributes: [
        { name: 'title', type: 'string', required: true, isEnum: false },
        { name: 'status', type: 'string', required: true, isEnum: true },
      ],
      relationships: [{ toEntityId: 'e2', cardinality: 'one_to_one', confidence: 'ambiguous' }],
    },
    {
      id: 'e2',
      name: 'CheckIn',
      description: 'A daily completion record',
      attributes: [{ name: 'date', type: 'date', required: true, isEnum: false }],
      relationships: [],
    },
  ],
  capabilities: [
    { id: 'c1', actorId: 'a1', verb: 'create', object: 'habit', description: 'add a habit' },
  ],
};

/** The Phase 2 output wrapping the extraction (Phase 3 reads only `.extraction`). */
export const PHASE2_OUTPUT: Phase2Output = {
  extraction: PHASE3_EXTRACTION,
  useCases: [
    {
      id: 'uc1',
      title: 'create habit',
      actorId: 'a1',
      preconditions: [],
      happyPath: [{ actor: 'user', action: 'adds a habit' }],
      failurePaths: [
        { trigger: 'empty name', systemResponse: 'block the save', userVisible: 'asks for a name' },
      ],
      dependsOn: [],
    },
  ],
  dependencyOrder: ['uc1'],
  screens: { approach: 'sketch', screens: ['Create habit'] },
};

/** Canned enum-value proposal for `Habit.status` (the single enum attribute). */
export const CANNED_ENUM: string[] = ['active', 'paused', 'archived'];

/** The user picks two of the proposed values and adds one custom value. */
export const ENUM_PICKED = ['active', 'paused'];
export const ENUM_CUSTOM = 'completed';

/** The FakeTransport steps in the order `runPhase3` calls the passes: one enum proposal. */
export const FAKE_STEPS: FakeStep[] = [{ kind: 'object', value: CANNED_ENUM }];

/**
 * The full scripted run: confirm the ambiguous cardinality, pick + extend the enum
 * values, choose a retention policy, accept the artifact.
 */
export const FULL_3_SCRIPT: ScriptedStep[] = [
  { kind: 'confirm', value: true }, // cardinality: one Habit → many CheckIns
  { kind: 'multiselect', value: ENUM_PICKED }, // Habit.status enum values
  { kind: 'text', value: ENUM_CUSTOM }, // one custom enum value
  { kind: 'select', value: 'recoverable' }, // p3.retention
  { kind: 'select', value: 'accept' }, // review 03-SCHEMAS.md
];

/** Cancel at the retention select, after cardinality and enum discovery are done. */
export const CANCEL_3_SCRIPT: ScriptedStep[] = [
  { kind: 'confirm', value: true },
  { kind: 'multiselect', value: ENUM_PICKED },
  { kind: 'text', value: ENUM_CUSTOM },
  { kind: 'cancel' }, // Ctrl-C at p3.retention
];

/** The remaining answers on resume — identical values, so fixture keys still match. */
export const RESUME_3_SCRIPT: ScriptedStep[] = [
  { kind: 'select', value: 'recoverable' },
  { kind: 'select', value: 'accept' },
];

/** A session sitting at the start of Phase 3: Phases 0–2 accepted, Phase 2 output present. */
export function phase3StartSession(): MustardSession {
  const ts = CLOCK();
  return {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 3,
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
        status: 'accepted',
        answers: [],
        followUpsAsked: 0,
        analysisRuns: 0,
        artifactPaths: ['02-USE-CASES.md'],
        edited: false,
        acceptedAt: ts,
        synthesisedObject: PHASE2_OUTPUT,
      },
    ],
    facts: { actorCount: 1 },
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Run Phase 3 with a scripted prompter over the given transport. */
export async function runPhase3Scripted(opts: {
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
  const session = await runPhase3(opts.session ?? phase3StartSession(), {
    prompter,
    proposeEnumValues: passes.proposeEnumValues,
    io,
    ...(opts.editor ? { editor: opts.editor } : {}),
    now: CLOCK,
    save,
    mustardVersion: VERSION,
  });
  return { session, prompter, writes: opts.io ? [] : mem.writes };
}
