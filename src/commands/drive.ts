import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncSessionIdentity } from '../engine/identity.js';
import type { AnalyseFn, RunnerIO, SynthesiseFn } from '../engine/runner.js';
import { runPhase } from '../engine/runner.js';
import { mustardDir, saveSession } from '../engine/session.js';
import type { BuildPassesOptions, Passes } from '../llm/passes/index.js';
import { buildPasses as realBuildPasses } from '../llm/passes/index.js';
import type { LLMTransport } from '../llm/transport.js';
import { phase0 } from '../questions/bank/phase-0.js';
import { phase1 } from '../questions/bank/phase-1.js';
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
 * M6 tops out at Phase 1; later milestones extend the phase list here.
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
  buildPasses?: (config: MustardConfig, opts?: BuildPassesOptions) => Passes;
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
  const io = deps.io ?? fileArtifactIO(deps.cwd);
  const save = deps.save ?? ((s: MustardSession) => saveSession(s, deps.cwd));
  const buildPasses = deps.buildPasses ?? realBuildPasses;
  const setup = deps.setup ?? runSetup;

  // Phase 0 has no synthesis, so these are never called; guard loudly if they are.
  const unused = (): never => {
    throw new Error('An LLM pass was invoked during a phase with no synthesis.');
  };

  let current = session;

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

  return current;
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

/** Default artifact writer, cwd-aware so commands and tests target a chosen directory. */
function fileArtifactIO(cwd?: string): RunnerIO {
  return {
    writeArtifact(name, body) {
      const dir = mustardDir(cwd);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), body, 'utf8');
    },
  };
}
