import { runPhase4 } from '../../src/engine/phase-4.js';
import type { RunnerIO } from '../../src/engine/runner.js';
import type { StackExplanation } from '../../src/llm/passes/explain-stack.js';
import { buildPasses } from '../../src/llm/passes/index.js';
import type { FakeStep, LLMTransport } from '../../src/llm/transport.js';
import type { Phase3Output } from '../../src/schemas/schema-model.js';
import type { MustardSession } from '../../src/schemas/session.js';
import type { Phase4Output, StackProposal } from '../../src/schemas/stack.js';
import type { FolderTree } from '../../src/schemas/structure.js';
import type { EditorLauncher } from '../../src/ui/editor.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { CLOCK, CONFIG } from './phase1-skeleton.js';
import { memoryIO } from './phase2b-fixture.js';
import { PHASE2_OUTPUT } from './phase3-fixture.js';

/**
 * Shared definition for Phase 4 (M11), golden project #1 continued. Holds the confirmed
 * Phase 2/3 outputs, the canned `propose-stack` / `explain-stack` / `propose-structure`
 * responses, and the scripted answers — imported by both the fixture recorder
 * (`record-phase4.ts`) and the integration test (`tests/unit/phase4.test.ts`), so record
 * and replay compute identical fixture keys.
 *
 * The scripted run exercises ALL FOUR review branches (§8.7): explain-more then accept,
 * a plain accept, choose-alternative, and already-decided (which LOCKS an override).
 */

/** Deterministic version for artifact frontmatter, so the snapshots are stable. */
export const VERSION = '0.0.0-test';

/** The Phase 3 model Phase 4 derives structure from (habit tracker). */
export const PHASE3_OUTPUT: Phase3Output = {
  models: [
    {
      entityId: 'e1',
      name: 'Habit',
      description: 'A habit being tracked',
      attributes: [
        { name: 'title', type: 'string', required: true, isEnum: false, enumValues: [] },
        {
          name: 'status',
          type: 'string',
          required: true,
          isEnum: true,
          enumValues: ['active', 'paused', 'completed'],
        },
      ],
      relationships: [{ toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' }],
    },
    {
      entityId: 'e2',
      name: 'CheckIn',
      description: 'A daily completion record',
      attributes: [{ name: 'date', type: 'date', required: true, isEnum: false, enumValues: [] }],
      relationships: [],
    },
  ],
  retention: 'recoverable',
};

/** The raw first-run description Phase 2 captured — read by propose-stack for grounding. */
export const CAPTURE = 'A member opens the app, creates a daily habit, and checks in each day.';

/**
 * The canned stack proposal. Four decisions, ordered to drive the four review branches,
 * and it INCLUDES a `storage` decision — the uploads→storage rubric (technical-plan M11).
 */
export const CANNED_STACK: StackProposal = [
  {
    componentId: 'web-frontend',
    category: 'frontend',
    choice: 'Next.js',
    justification:
      'Next.js gives you a single well-trodden framework for the screens and the server bits, which is exactly what a habit tracker on the web needs.',
    alternatives: [
      { name: 'Remix', tradeoff: 'Great data handling, smaller ecosystem.' },
      { name: 'SvelteKit', tradeoff: 'Lighter to write, fewer hired hands know it.' },
    ],
    locked: false,
  },
  {
    componentId: 'primary-database',
    category: 'database',
    choice: 'PostgreSQL',
    justification:
      'A rock-solid relational database that fits the Habit and CheckIn tables cleanly and scales well past your first hundreds of users.',
    alternatives: [
      { name: 'SQLite', tradeoff: 'Zero setup, awkward once you have many writers.' },
      { name: 'MySQL', tradeoff: 'Also solid, slightly weaker JSON support.' },
    ],
    locked: false,
  },
  {
    componentId: 'object-storage',
    category: 'storage',
    choice: 'Amazon S3',
    justification:
      'Because people upload files, you need somewhere durable to keep them; S3 is the default the whole ecosystem is built around.',
    alternatives: [
      { name: 'Cloudflare R2', tradeoff: 'No egress fees, newer tooling.' },
      { name: 'Supabase Storage', tradeoff: 'Bundled with the DB, less control.' },
    ],
    locked: false,
  },
  {
    componentId: 'authentication',
    category: 'auth',
    choice: 'Clerk',
    justification:
      'A hosted sign-in service so you do not hand-roll password security; drops into a Next.js app in an afternoon.',
    alternatives: [
      { name: 'Auth.js', tradeoff: 'Free and flexible, more wiring to do.' },
      { name: 'Supabase Auth', tradeoff: 'Bundled with the DB, less polished UI.' },
    ],
    locked: false,
  },
];

/** Canned "explain more" elaboration for the frontend decision. */
export const CANNED_EXPLANATION: StackExplanation = {
  explanation:
    'Next.js is a framework that bundles the front-end screens and a small backend together. It wins when you want one codebase and good defaults; a lighter tool like SvelteKit is better if bundle size is your top concern.',
};

/** Canned folder tree for the accepted stack. */
export const CANNED_STRUCTURE: FolderTree = [
  {
    name: 'src',
    kind: 'dir',
    description: 'Application code',
    children: [
      { name: 'app', kind: 'dir', description: 'Next.js routes and pages' },
      { name: 'models', kind: 'dir', description: 'Habit and CheckIn data models' },
      { name: 'lib', kind: 'dir', description: 'Database and storage clients' },
    ],
  },
  { name: 'package.json', kind: 'file' },
  { name: 'README.md', kind: 'file' },
];

/** FakeTransport steps in the exact order runPhase4 calls the passes. */
export const FAKE_STEPS: FakeStep[] = [
  { kind: 'object', value: CANNED_STACK }, // 1. propose-stack (PROPOSE)
  { kind: 'object', value: CANNED_EXPLANATION }, // 2. explain-stack (decision 0)
  { kind: 'object', value: CANNED_STRUCTURE }, // 3. propose-structure (STRUCTURE)
];

/** The scripted SEED answers — deterministic, so the propose-stack input hash is stable. */
const SEED_STEPS: ScriptedStep[] = [
  { kind: 'select', value: 'web' }, // p4.run-target
  { kind: 'select', value: 'hundreds' }, // p4.scale
  { kind: 'select', value: 'personal' }, // p4.sensitivity
  { kind: 'select', value: 'one-country' }, // p4.user-location
  { kind: 'confirm', value: true }, // p4.uploads → needs.objectStorage
  // p4.concurrent is skipped (actorCount === 1)
  { kind: 'confirm', value: false }, // p4.payments
  { kind: 'confirm', value: true }, // p4.email
  { kind: 'confirm', value: true }, // p4.background
  { kind: 'confirm', value: false }, // p4.inference
  { kind: 'select', value: 'email-password' }, // p4.auth
  { kind: 'confirm', value: false }, // p4.offline
  { kind: 'confirm', value: false }, // p4.search
  { kind: 'confirm', value: false }, // p4.admin
];

/** The decision-loop answers — one branch per decision, covering all four. */
const DECISION_STEPS: ScriptedStep[] = [
  { kind: 'select', value: 'explain-more' }, // decision 0: ask for more…
  { kind: 'select', value: 'accept' }, // …then accept Next.js
  { kind: 'select', value: 'accept' }, // decision 1: accept PostgreSQL
  { kind: 'select', value: 'choose-alternative' }, // decision 2: swap S3…
  { kind: 'select', value: 'Cloudflare R2' }, // …for the first alternative
  { kind: 'select', value: 'already-decided' }, // decision 3: override auth…
  { kind: 'text', value: 'Auth0' }, // …with a locked choice
];

/** The two write-gate reviews (04-STACK.md, then 03-STRUCTURE.md). */
const WRITE_STEPS: ScriptedStep[] = [
  { kind: 'select', value: 'accept' },
  { kind: 'select', value: 'accept' },
];

/** The full scripted run. */
export const FULL_4_SCRIPT: ScriptedStep[] = [...SEED_STEPS, ...DECISION_STEPS, ...WRITE_STEPS];

/** Cancel in the decision loop, after the first two decisions are resolved. */
export const CANCEL_4_SCRIPT: ScriptedStep[] = [
  ...SEED_STEPS,
  { kind: 'select', value: 'explain-more' },
  { kind: 'select', value: 'accept' }, // decision 0 done
  { kind: 'select', value: 'accept' }, // decision 1 done
  { kind: 'cancel' }, // Ctrl-C reviewing decision 2
];

/** Resume answers: the remaining decisions + writes, identical values so keys still match. */
export const RESUME_4_SCRIPT: ScriptedStep[] = [
  { kind: 'select', value: 'choose-alternative' },
  { kind: 'select', value: 'Cloudflare R2' },
  { kind: 'select', value: 'already-decided' },
  { kind: 'text', value: 'Auth0' },
  ...WRITE_STEPS,
];

/** A session sitting at the start of Phase 4: Phases 0–3 accepted, outputs present. */
export function phase4StartSession(): MustardSession {
  const ts = CLOCK();
  return {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 4,
    phases: [
      accepted(0, [], ts),
      accepted(1, ['01-MANIFESTO.md', '01-AI-LAWS.md'], ts),
      {
        ...accepted(2, ['02-USE-CASES.md'], ts),
        answers: [
          { questionId: 'p2.capture', type: 'editor', value: CAPTURE, source: 'seed', askedAt: ts },
        ],
        synthesisedObject: PHASE2_OUTPUT,
      },
      { ...accepted(3, ['03-SCHEMAS.md'], ts), synthesisedObject: PHASE3_OUTPUT },
    ],
    facts: { actorCount: 1 },
    factSources: { actorCount: 'derived' },
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

/** Run Phase 4 with a scripted prompter over the given transport. */
export async function runPhase4Scripted(opts: {
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
  const session = await runPhase4(opts.session ?? phase4StartSession(), {
    prompter,
    proposeStack: passes.proposeStack,
    explainStack: passes.explainStack,
    proposeStructure: passes.proposeStructure,
    io,
    ...(opts.editor ? { editor: opts.editor } : {}),
    now: CLOCK,
    save,
    mustardVersion: VERSION,
  });
  return { session, prompter, writes: opts.io ? [] : mem.writes };
}

/** The full Phase 4 output for a clean run — used by the render unit tests. */
export const EXPECTED_PHASE4_OUTPUT: Phase4Output = {
  decisions: [
    CANNED_STACK[0] as Phase4Output['decisions'][number],
    CANNED_STACK[1] as Phase4Output['decisions'][number],
    { ...(CANNED_STACK[2] as Phase4Output['decisions'][number]), choice: 'Cloudflare R2' },
    {
      ...(CANNED_STACK[3] as Phase4Output['decisions'][number]),
      choice: 'Auth0',
      locked: true,
    },
  ],
  structure: CANNED_STRUCTURE,
};
