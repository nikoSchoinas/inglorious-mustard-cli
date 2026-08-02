import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Answer, MustardSession, PhaseState } from '../schemas/session.js';
import { mustardDir } from './session.js';

/**
 * The shared toolkit for phase orchestrators — the generic `runPhase` machine
 * (runner.ts) and the bespoke Phase 2A/2B/3 flows alike. One home for the
 * clone-ensure-mutate session pattern, the answer-level-resume helpers, and
 * artifact IO, so a durability bug cannot exist in one orchestrator and not the
 * others. Phases 4+ add no copies of these — they import them.
 *
 * Marker answers (the pseudo-answers bespoke orchestrators persist to make
 * resume answer-level) use `source: 'derived'` by convention: they are produced
 * by the flow, not typed by the user.
 */

/** Where artifacts are written. Abstracted so tests target a temp dir or memory. */
export interface RunnerIO {
  writeArtifact(name: string, body: string): void;
}

/**
 * Default artifact writer: `mustard/<name>` under `cwd`, creating parent dirs as
 * needed. `name` may be nested (e.g. `07-PROMPTS/T001-setup.md`), so the target's
 * own directory — not just `mustard/` — is created.
 */
export function fileArtifactIO(cwd?: string): RunnerIO {
  return {
    writeArtifact(name, body) {
      const full = join(mustardDir(cwd), name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body, 'utf8');
    },
  };
}

/** The phase's state, throwing if the orchestrator has not created it yet. */
export function phaseStateOf(session: MustardSession, id: number): PhaseState {
  const ps = session.phases.find((p) => p.id === id);
  if (ps === undefined) {
    throw new Error(`No PhaseState for phase ${id} — the orchestrator should have created it.`);
  }
  return ps;
}

/** A fresh, empty PhaseState. */
function emptyPhaseState(id: number): PhaseState {
  return {
    id,
    status: 'pending',
    answers: [],
    followUpsAsked: 0,
    analysisRuns: 0,
    artifactPaths: [],
    edited: false,
  };
}

/**
 * Clone the session, ensure the phase exists, run `mutate`, return the new
 * session. Callers persist the result — mutate-then-save is the durability
 * boundary every orchestrator shares.
 */
export function withPhase(
  session: MustardSession,
  id: number,
  mutate: (next: MustardSession, ps: PhaseState) => void,
): MustardSession {
  const next = structuredClone(session);
  let ps = next.phases.find((p) => p.id === id);
  if (ps === undefined) {
    ps = emptyPhaseState(id);
    next.phases.push(ps);
  }
  mutate(next, ps);
  return next;
}

/**
 * Answer-level resume check: has this question (or marker) been answered?
 * Pass `source` to disambiguate ids reused across sources (the generic runner's
 * seed vs follow-up namespaces); omit it for the bespoke orchestrators' markers.
 */
export function isAnswered(ps: PhaseState, questionId: string, source?: Answer['source']): boolean {
  return ps.answers.some(
    (a) => a.questionId === questionId && (source === undefined || a.source === source),
  );
}

/** An answer record, for pushing into `PhaseState.answers`. */
export function makeAnswer(
  questionId: string,
  type: Answer['type'],
  value: Answer['value'],
  source: Answer['source'],
  askedAt: string,
): Answer {
  return { questionId, type, value, source, askedAt };
}

/** Split a free-text addition on commas or newlines into trimmed, non-empty items. */
export function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
