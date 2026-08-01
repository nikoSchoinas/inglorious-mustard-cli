import type { CommandDeps } from '../../src/commands/drive.js';
import { buildPasses } from '../../src/llm/passes/index.js';
import type { LLMTransport } from '../../src/llm/transport.js';
import type { PhaseAnalysis } from '../../src/schemas/analysis.js';
import type { MustardConfig } from '../../src/schemas/config.js';
import type { ManifestoArtifact } from '../../src/schemas/manifesto.js';
import { CANCEL, ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';

/**
 * Golden project #1 — the "single-user habit tracker" (technical-plan §4, M6). One
 * shared definition of the scripted answers and canned LLM responses, imported by
 * both the fixture generator (`record.ts`) and the skeleton acceptance test
 * (`tests/unit/skeleton.test.ts`). Sharing the script is what guarantees the record
 * and replay runs compute identical fixture keys.
 */

export const CLOCK = (): string => '2026-08-01T00:00:00.000Z';

/** Fixed provider config, so the passes build a model handle without a real key. */
export const CONFIG: MustardConfig = {
  provider: 'anthropic',
  models: { fast: 'fast-model', deep: 'deep-model' },
  apiKeySource: 'env',
  telemetry: false,
};

// The habit-tracker answers, as shared constants so the clean run and the
// cancel→resume run submit byte-identical values (same fixture keys).
const WHY =
  'People who want to build a daily habit have nowhere simple and private to track it. ' +
  'Existing apps are bloated, ad-ridden, or sell your data. Someone trying to meditate or ' +
  'run every morning is worse off because the friction of heavy tools makes them quit before the habit sticks.';
const NAME = 'Habit Tracker';
const RULES = ['stay-true-to-users', 'ship-before-perfect', 'document-or-it-didnt-happen'];
const MACHINE = ['tests-alongside-features', 'no-new-dependency-without-asking'];

/** The full clean init run: Phase 0 (4 selects) → Phase 1 seed → two review accepts. */
export const FULL_SCRIPT: ScriptedStep[] = [
  { kind: 'select', value: 'some' }, // p0.literacy
  { kind: 'select', value: 'greenfield' }, // p0.project-type
  { kind: 'select', value: 'claude-code' }, // p0.agent-target
  { kind: 'select', value: 'anthropic' }, // p0.provider
  { kind: 'editor', value: WHY }, // p1.why
  { kind: 'text', value: NAME }, // p1.name
  { kind: 'multiselect', value: RULES }, // p1.rules (no write-my-own → custom-rules skipped)
  { kind: 'multiselect', value: MACHINE }, // p1.machine-rules
  { kind: 'select', value: 'accept' }, // review 01-MANIFESTO.md
  { kind: 'select', value: 'accept' }, // review 01-AI-LAWS.md
];

/** Cancel partway through Phase 1 (after the `why` answer), for the resume test. */
export const CANCEL_SCRIPT: ScriptedStep[] = [
  { kind: 'select', value: 'some' },
  { kind: 'select', value: 'greenfield' },
  { kind: 'select', value: 'claude-code' },
  { kind: 'select', value: 'anthropic' },
  { kind: 'editor', value: WHY },
  CANCEL, // Ctrl-C at p1.name
];

/** The remaining answers on resume — identical values, so fixture keys still match. */
export const RESUME_SCRIPT: ScriptedStep[] = [
  { kind: 'text', value: NAME },
  { kind: 'multiselect', value: RULES },
  { kind: 'multiselect', value: MACHINE },
  { kind: 'select', value: 'accept' },
  { kind: 'select', value: 'accept' },
];

/** Canned ANALYSE response — ready to synthesise, so no follow-ups (one analyse call). */
export const CANNED_ANALYSE: PhaseAnalysis = {
  gaps: [],
  contradictions: [],
  derivedFacts: [],
  readyToSynthesise: true,
};

/** Canned SYNTHESISE response — a plausible manifesto within both caps. */
export const CANNED_MANIFESTO: ManifestoArtifact = {
  projectName: NAME,
  mission:
    'Habit Tracker gives one person a simple, private place to build a daily habit — no ads, no accounts, no data harvesting — so the tool never becomes the reason they quit.',
  values: [
    {
      title: 'Stay true to your users',
      rationale: 'Every feature serves the person building a habit, not a growth metric.',
    },
    {
      title: 'Ship before perfect',
      rationale: 'A working daily streak beats a beautiful unfinished dashboard.',
    },
    {
      title: "Document it or it doesn't exist",
      rationale: 'If a behaviour is not written down, the next change will break it.',
    },
    {
      title: 'Keep it private by default',
      rationale: "A habit is personal; data stays on the user's device unless they ask otherwise.",
    },
    {
      title: 'Reduce friction relentlessly',
      rationale: 'Every extra tap is a reason to skip a day.',
    },
  ],
  aiLaws: [
    'Write tests alongside every feature.',
    'Never add a dependency without asking first.',
    'Keep user data local unless the user explicitly opts in to sync.',
    'Fail loudly and visibly; never swallow an error.',
    'Prefer the simplest implementation that satisfies the acceptance criteria.',
  ],
};

export interface SkeletonOptions {
  cwd: string;
  transport: LLMTransport;
  script: ScriptedStep[];
  /** Config home; unused when `setup` is injected, but kept for completeness. */
  home?: string;
  exit?: (code: number) => never;
  print?: (message: string) => void;
}

/**
 * Build the injected command deps for a skeleton run. The 0.5 setup step is
 * stubbed (fixed config, no key prompt, no connectivity call) so the test targets
 * the walking skeleton itself; the setup logic is covered separately. `buildPasses`
 * is wrapped to route through the caller's transport (record or replay).
 */
export function skeletonDeps(opts: SkeletonOptions): {
  deps: CommandDeps;
  prompter: ScriptedPrompter;
} {
  const prompter = new ScriptedPrompter(opts.script);
  const deps: CommandDeps = {
    prompter,
    cwd: opts.cwd,
    now: CLOCK,
    installCancel: false,
    setup: async () => ({ config: CONFIG, apiKey: 'dummy' }),
    buildPasses: (config, o) => buildPasses(config, { ...o, transport: opts.transport }),
    // The Phase 1 walking skeleton stops at Phase 1; Phase 2A/2B, Phase 3 and Phase 4
    // have their own golden fixtures and tests, so stub them out here as no-ops.
    runPhase2A: async (session) => session,
    runPhase2B: async (session) => session,
    runPhase3: async (session) => session,
    runPhase4: async (session) => session,
    ...(opts.exit ? { exit: opts.exit } : {}),
    ...(opts.print ? { print: opts.print } : {}),
  };
  return { deps, prompter };
}
