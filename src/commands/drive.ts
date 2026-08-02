import { syncSessionIdentity } from '../engine/identity.js';
import { fileArtifactIO, noopArtifactIO } from '../engine/orchestrator.js';
import { type RunPhase2ADeps, runPhase2A as realRunPhase2A } from '../engine/phase-2a.js';
import { type RunPhase2BDeps, runPhase2B as realRunPhase2B } from '../engine/phase-2b.js';
import { type RunPhase3Deps, runPhase3 as realRunPhase3 } from '../engine/phase-3.js';
import { type RunPhase4Deps, runPhase4 as realRunPhase4 } from '../engine/phase-4.js';
import { type RunPhase5Deps, runPhase5 as realRunPhase5 } from '../engine/phase-5.js';
import { type RunPhase6Deps, runPhase6 as realRunPhase6 } from '../engine/phase-6.js';
import { type RunPhase7Deps, runPhase7 as realRunPhase7 } from '../engine/phase-7.js';
import type { AnalyseFn, RunnerIO, SynthesiseFn } from '../engine/runner.js';
import { runPhase } from '../engine/runner.js';
import { saveSession } from '../engine/session.js';
import type { BuildPassesOptions, Passes } from '../llm/passes/index.js';
import { buildPasses as realBuildPasses } from '../llm/passes/index.js';
import type { LLMTransport } from '../llm/transport.js';
import { phase0 } from '../questions/bank/phase-0.js';
import { phase1 } from '../questions/bank/phase-1.js';
import { fileAdapterIO, memoryAdapterIO } from '../render/adapters/io.js';
import type { MustardConfig, Provider } from '../schemas/config.js';
import type { MustardSession } from '../schemas/session.js';
import type { EditorLauncher } from '../ui/editor.js';
import type { Prompter } from '../ui/prompter.js';
import type { CheckConnectivityFn, SetupDeps, SetupResult } from './setup.js';
import { runSetup } from './setup.js';

/**
 * The shared mission orchestration for `init` and `resume` (spec §8): drive the
 * session through Phase 0 → the 0.5 setup step → Phase 1. Both commands run the
 * SAME driver, differing only in how they obtain the starting session (fresh vs
 * loaded from disk). Every step is idempotent and re-derives its position from the
 * persisted `PhaseState`, so a resumed run skips accepted phases and the setup step
 * reuses a matching config — the walking skeleton (technical-plan §4).
 *
 * The driver runs Phase 0 → 0.5 setup → Phases 1–7 — the full seven-phase mission.
 */

const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama'] as const;

/** Shared shape for the `init` / `resume` command entry points — all deps optional. */
export interface CommandDeps extends Partial<MissionDeps> {
  /** Register a process SIGINT handler (real CLI). Off in tests. Default true. */
  installCancel?: boolean;
}

export interface MissionDeps {
  prompter: Prompter;
  /** Working directory that holds `mustard/`. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Config home (`~/.mustard`). */
  home?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  editor?: EditorLauncher;
  io?: RunnerIO;
  save?: (session: MustardSession) => MustardSession;
  /**
   * `--dry-run` (spec §9.6): run the interrogation, write nothing. When set, the
   * default artifact IO, adapter IO and session save all become no-ops — nothing
   * touches disk. Explicit `io`/`save` overrides (tests) still win.
   */
  dryRun?: boolean;
  buildPasses?: (config: MustardConfig, opts?: BuildPassesOptions) => Passes;
  /** Phase 2A orchestrator (M8). Injectable so tests can stub it. */
  runPhase2A?: (session: MustardSession, deps: RunPhase2ADeps) => Promise<MustardSession>;
  /** Phase 2B orchestrator (M9). Injectable so tests can stub it. */
  runPhase2B?: (session: MustardSession, deps: RunPhase2BDeps) => Promise<MustardSession>;
  /** Phase 3 orchestrator (M10). Injectable so tests can stub it. */
  runPhase3?: (session: MustardSession, deps: RunPhase3Deps) => Promise<MustardSession>;
  /** Phase 4 orchestrator (M11). Injectable so tests can stub it. */
  runPhase4?: (session: MustardSession, deps: RunPhase4Deps) => Promise<MustardSession>;
  /** Phase 5 orchestrator (M12). Injectable so tests can stub it. */
  runPhase5?: (session: MustardSession, deps: RunPhase5Deps) => Promise<MustardSession>;
  /** Phase 6 orchestrator (M13). Injectable so tests can stub it. */
  runPhase6?: (session: MustardSession, deps: RunPhase6Deps) => Promise<MustardSession>;
  /** Phase 7 orchestrator (M13). Injectable so tests can stub it. */
  runPhase7?: (session: MustardSession, deps: RunPhase7Deps) => Promise<MustardSession>;
  setup?: (provider: Provider, deps: SetupDeps) => Promise<SetupResult>;
  // Passed through to the setup step:
  transport?: LLMTransport;
  checkConnectivity?: CheckConnectivityFn;
  exit?: (code: number) => never;
  print?: (message: string) => void;
}

export async function driveMission(
  session: MustardSession,
  deps: MissionDeps,
): Promise<MustardSession> {
  const now = deps.now ?? (() => new Date().toISOString());
  const dryRun = deps.dryRun ?? false;
  const io = deps.io ?? (dryRun ? noopArtifactIO() : fileArtifactIO(deps.cwd));
  const save =
    deps.save ??
    (dryRun ? (s: MustardSession) => s : (s: MustardSession) => saveSession(s, deps.cwd));
  const buildPasses = deps.buildPasses ?? realBuildPasses;
  const runPhase2A = deps.runPhase2A ?? realRunPhase2A;
  const runPhase2B = deps.runPhase2B ?? realRunPhase2B;
  const runPhase3 = deps.runPhase3 ?? realRunPhase3;
  const runPhase4 = deps.runPhase4 ?? realRunPhase4;
  const runPhase5 = deps.runPhase5 ?? realRunPhase5;
  const runPhase6 = deps.runPhase6 ?? realRunPhase6;
  const runPhase7 = deps.runPhase7 ?? realRunPhase7;
  const setup = deps.setup ?? runSetup;

  // Phase 0 has no synthesis, so these are never called; guard loudly if they are.
  const unused = (): never => {
    throw new Error('An LLM pass was invoked during a phase with no synthesis.');
  };

  let current = session;

  // Surface hand-edit staleness (technical-plan §2.4): later phases derive from
  // the typed `synthesisedObject`, NOT from an artifact the user rewrote in
  // $EDITOR. Before running a phase, note any earlier accepted-and-edited phase
  // once, so the user knows to carry substantive edits forward themselves.
  const staleWarned = new Set<number>();
  const warnStaleEdits = (upTo: number): void => {
    for (const p of current.phases) {
      if (p.id < upTo && p.status === 'accepted' && p.edited && !staleWarned.has(p.id)) {
        staleWarned.add(p.id);
        deps.prompter.note(
          `You hand-edited ${p.artifactPaths.join(', ')} in Phase ${p.id}. What comes next derives from the recorded answers, not your edits — if the edits changed the substance, restate it in your upcoming answers.`,
          'Edited artifact',
        );
      }
    }
  };

  // Phase 0 — Recon (structured questions only).
  if (!isAccepted(current, 0)) {
    current = await runPhase(phase0, current, {
      prompter: deps.prompter,
      analyse: unused as unknown as AnalyseFn,
      synthesise: unused as unknown as SynthesiseFn,
      io,
      editor: deps.editor,
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  // 0.5 — key capture, connectivity, telemetry. Idempotent: reuses a matching config.
  const provider = resolveProvider(current);
  const { config, apiKey } = await setup(provider, {
    prompter: deps.prompter,
    home: deps.home,
    env: deps.env,
    transport: deps.transport,
    checkConnectivity: deps.checkConnectivity,
    exit: deps.exit,
    print: deps.print,
  });
  const passes = buildPasses(config, { apiKey, now });

  // Phase 1 — Manifesto (full SEED → ANALYSE → FOLLOW-UP → SYNTHESISE → REVIEW → WRITE).
  if (!isAccepted(current, 1)) {
    current = await runPhase(phase1, current, {
      prompter: deps.prompter,
      analyse: passes.analyse,
      synthesise: passes.synthesise,
      io,
      editor: deps.editor,
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  // Phase 2A — Use Cases & UI, part A (M8): capture → extract → reflection →
  // capability loop. A bespoke orchestrator, not `runPhase` (§8.5 doesn't fit the
  // generic machine). It ends with a confirmed DomainExtraction in session state and
  // leaves the phase `in_progress`. The `!phase2bStarted` guard stops part A once
  // part B has wrapped `synthesisedObject` into a `Phase2Output` (which part A would
  // fail to re-parse as a `DomainExtraction`); until then, part A resumes normally.
  if (!isAccepted(current, 2) && !phase2bStarted(current)) {
    warnStaleEdits(2);
    current = await runPhase2A(current, {
      prompter: deps.prompter,
      extract: passes.extract,
      suggestCapabilities: passes.suggestCapabilities,
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  // Phase 2B — Use Cases & UI, part B (M9): happy paths → the failure interrogation →
  // dependency ordering → the UI step → `02-USE-CASES.md`. It wraps part A's
  // extraction, fills it, renders, and marks the phase accepted. Idempotent.
  if (!isAccepted(current, 2)) {
    current = await runPhase2B(current, {
      prompter: deps.prompter,
      happyPath: passes.happyPath,
      failureQuestions: passes.failureQuestions,
      failureStructure: passes.failureStructure,
      orderUseCases: passes.orderUseCases,
      io,
      editor: deps.editor,
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  // Phase 3 — Structure & Schemas (M10): derive the data model from the Phase 2
  // entities, disambiguate ambiguous cardinality, discover enum values, pick a
  // retention policy → `03-SCHEMAS.md`. A bespoke orchestrator, not `runPhase`
  // (§8.6 doesn't fit the generic machine). Emits `03-SCHEMAS.md` only —
  // `03-STRUCTURE.md` is a Phase 4 artifact (pitfall §7.1). Idempotent.
  if (!isAccepted(current, 3)) {
    warnStaleEdits(3);
    current = await runPhase3(current, {
      prompter: deps.prompter,
      proposeEnumValues: passes.proposeEnumValues,
      io,
      editor: deps.editor,
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  // Phase 4 — Tools & Technologies (M11): ask the business questions, propose the
  // stack one decision at a time, then render `04-STACK.md` and the deferred
  // `03-STRUCTURE.md` against the accepted stack. A bespoke orchestrator, not
  // `runPhase` (§8.7 doesn't fit the generic machine). Idempotent.
  if (!isAccepted(current, 4)) {
    warnStaleEdits(4);
    current = await runPhase4(current, {
      prompter: deps.prompter,
      proposeStack: passes.proposeStack,
      explainStack: passes.explainStack,
      proposeStructure: passes.proposeStructure,
      io,
      editor: deps.editor,
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  // Phase 5 — Architecture (M12): ask the two derived questions, synthesise the
  // component diagram + riskiest sequence diagrams + ADR log + the three
  // irreversible decisions, confirm each at the non-blocking irreversibility gate,
  // then render `05-ARCHITECTURE.md` and `05-DECISIONS.md`. A bespoke orchestrator,
  // not `runPhase` (§8.8 doesn't fit the generic machine). Idempotent.
  if (!isAccepted(current, 5)) {
    warnStaleEdits(5);
    current = await runPhase5(current, {
      prompter: deps.prompter,
      analyse: passes.analyse,
      synthesiseArchitecture: passes.synthesiseArchitecture,
      io,
      editor: deps.editor,
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  // Phase 6 — Roadmap (M13): ask hours/week + testing policy, sequence the build
  // into agent-sized tasks (deterministic topology), render `06-ROADMAP.md` and
  // mirror the ordered tasks into `session.tasks`. A bespoke orchestrator, not
  // `runPhase` (§8.9 has its own review shape). Idempotent.
  if (!isAccepted(current, 6)) {
    warnStaleEdits(6);
    current = await runPhase6(current, {
      prompter: deps.prompter,
      analyse: passes.analyse,
      sequence: passes.sequence,
      io,
      editor: deps.editor,
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  // Phase 7 — Development & Documentation (M13): pure generation. Render a prompt
  // card per task, the repo-root agent adapter (sentinel-merged), and the briefing
  // last, behind a single bundle-level confirm. A bespoke orchestrator, not
  // `runPhase` (§8.10 has no questions). Idempotent.
  if (!isAccepted(current, 7)) {
    current = await runPhase7(current, {
      prompter: deps.prompter,
      io,
      // Adapter files are written at the repo root — honour the mission's cwd, as `io`
      // does. Under `--dry-run` the adapter goes to a throwaway in-memory sink.
      adapterIo: dryRun ? memoryAdapterIO() : fileAdapterIO(deps.cwd),
      now,
      save,
    });
    current = save(syncSessionIdentity(current));
  }

  return current;
}

/** True once Phase 2 part B has wrapped the extraction into a `Phase2Output`. */
function phase2bStarted(session: MustardSession): boolean {
  const ps = session.phases.find((p) => p.id === 2);
  return ps?.answers.some((a) => a.questionId === 'p2b.seeded') ?? false;
}

function isAccepted(session: MustardSession, phaseId: number): boolean {
  return session.phases.find((p) => p.id === phaseId)?.status === 'accepted';
}

/** The provider chosen in Phase 0 (`p0.provider` → `facts.provider`). */
function resolveProvider(session: MustardSession): Provider {
  const value = session.facts.provider;
  if (typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)) {
    return value as Provider;
  }
  throw new Error(
    `No provider recorded from Phase 0 (facts.provider=${JSON.stringify(value)}). Re-run \`mustard init\`.`,
  );
}
