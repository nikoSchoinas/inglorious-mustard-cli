import type { LlmOutcome } from '../llm/client.js';
import { resolvePrompt } from '../questions/index.js';
import type { Facts, Phase, Question } from '../questions/types.js';
import {
  type FrontmatterMeta,
  deriveSessionId,
  withFrontmatter,
} from '../render/markdown/frontmatter.js';
import type { PhaseAnalysis } from '../schemas/analysis.js';
import type { Answer, MustardSession, PhaseState } from '../schemas/session.js';
import { type EditorLauncher, defaultEditorLauncher } from '../ui/editor.js';
import type { Prompter } from '../ui/prompter.js';
import { reviewGate } from '../ui/review-gate.js';
import { readVersion } from '../version.js';
import { canSynthesise, selectFollowUpGaps } from './budget.js';
import { type IncomingFact, applyFacts } from './facts.js';
import {
  type RunnerIO,
  fileArtifactIO,
  isAnswered,
  phaseStateOf,
  withPhase,
} from './orchestrator.js';
import { saveSession } from './session.js';

export type { RunnerIO } from './orchestrator.js';

/**
 * The per-phase state machine (spec §8.2) — the heart of the product. Generic
 * over ANY bank module: it drives one `Phase` through
 *
 *   SEED → ANALYSE → FOLLOW-UP → SYNTHESISE → REVIEW → WRITE
 *
 * and contains ZERO phase-specific question text or branching (the M2 tripwire,
 * pitfall §7.2). All content flows in through the bank module and the two
 * injected LLM passes; all durability flows through `save`.
 *
 * Resume is answer-level from day one (pitfall §7.5): every stage re-derives its
 * position from the persisted `PhaseState` — answered seed ids, `analysis`
 * presence, `analysisRuns`, `followUpsAsked` — so re-invoking `runPhase` after a
 * Ctrl-C continues from the exact next question. The runner never installs its
 * own SIGINT handler; the command layer (M6) owns that. The runner's contract is
 * simply that every answer and transition is persisted before the next prompt.
 */

/** The rendered output of a SYNTHESISE pass: the typed object plus its markdown. */
export interface SynthesisOutput {
  /** Retained into `PhaseState.synthesisedObject` for downstream derivation (§2.4). */
  object: unknown;
  /** One rendered artifact per `phase.synthesis.artifacts` entry. */
  artifacts: ReadonlyArray<{ name: string; body: string }>;
}

/** The ANALYSE pass — the same shape for every phase (§8.2 step 2). */
export type AnalyseFn = (
  phase: Phase,
  session: MustardSession,
) => Promise<LlmOutcome<PhaseAnalysis>>;

/**
 * The SYNTHESISE pass — per-phase, returns a typed object rendered
 * to markdown (§8.2 step 4). `steering` carries the review-gate redo intent:
 * `'detail'` (redo with more detail) or `'differently'` (redo answering
 * differently) both re-run only synthesis with a different prompt hint.
 */
export type SynthesiseFn = (
  phase: Phase,
  session: MustardSession,
  steering?: 'detail' | 'differently',
) => Promise<LlmOutcome<SynthesisOutput>>;

export interface RunPhaseDeps {
  prompter: Prompter;
  analyse: AnalyseFn;
  synthesise: SynthesiseFn;
  /** Defaults to writing under `mustard/` in the cwd. */
  io?: RunnerIO;
  /** Defaults to `$EDITOR` via `defaultEditorLauncher`. */
  editor?: EditorLauncher;
  /** ISO clock for `askedAt`/`acceptedAt`. Injectable for deterministic tests. */
  now?: () => string;
  /** Persist step. Defaults to `saveSession` (atomic write + `.bak`). */
  save?: (session: MustardSession) => MustardSession;
  /** Package version for degraded-artifact frontmatter. Defaults to the runtime version. */
  mustardVersion?: string;
}

/**
 * Run one phase to acceptance, returning the persisted session. Idempotent on
 * re-entry: safe to call again after a Ctrl-C to resume mid-phase.
 */
export async function runPhase(
  phase: Phase,
  session: MustardSession,
  deps: RunPhaseDeps,
): Promise<MustardSession> {
  const io = deps.io ?? fileArtifactIO();
  const editor = deps.editor ?? defaultEditorLauncher;
  const now = deps.now ?? (() => new Date().toISOString());
  const save = deps.save ?? ((s: MustardSession) => saveSession(s));
  const mustardVersion = deps.mustardVersion ?? readVersion();

  const ctx: Ctx = { phase, deps, io, editor, now, save, mustardVersion };

  // Ensure the PhaseState exists and is marked in_progress before any question.
  let current = withPhase(session, phase.phase, (_s, ps) => {
    if (ps.status === 'pending') {
      ps.status = 'in_progress';
    }
  });
  current = ctx.save(current);

  // SEED — ask remaining seed questions, persisting each answer immediately.
  current = await runSeed(ctx, current);

  // Phase 0 (Recon) has no synthesis: accept and advance once seed is done.
  if (phase.synthesis === undefined) {
    return accept(ctx, current);
  }

  // ANALYSE / FOLLOW-UP loop (§8.2 steps 2–3), bounded by the budget guards.
  current = await runAnalysisLoop(ctx, current);

  // SYNTHESISE → REVIEW → WRITE (§8.2 steps 4–6).
  return runSynthesisAndReview(ctx, current);
}

interface Ctx {
  phase: Phase;
  deps: RunPhaseDeps;
  io: RunnerIO;
  editor: EditorLauncher;
  now: () => string;
  save: (session: MustardSession) => MustardSession;
  mustardVersion: string;
}

// --------------------------------------------------------------------------
// SEED
// --------------------------------------------------------------------------

async function runSeed(ctx: Ctx, session: MustardSession): Promise<MustardSession> {
  let current = session;
  for (const question of ctx.phase.seed) {
    const ps = phaseStateOf(current, ctx.phase.phase);
    // A `when` predicate reads the live facts store; a later question can depend
    // on an earlier answer (e.g. phase-1 custom-rules ← manifesto.rules).
    if (question.when && !question.when(current.facts as Facts)) {
      continue;
    }
    if (isAnswered(ps, question.id, 'seed')) {
      continue; // resume: already captured on a prior run
    }
    const value = await ask(ctx.deps.prompter, question, current.literacy);
    current = recordAnswer(ctx, current, question, value, 'seed');
  }
  return current;
}

// --------------------------------------------------------------------------
// ANALYSE / FOLLOW-UP
// --------------------------------------------------------------------------

async function runAnalysisLoop(ctx: Ctx, session: MustardSession): Promise<MustardSession> {
  let current = session;

  while (!canSynthesise(phaseStateOf(current, ctx.phase.phase))) {
    const ps = phaseStateOf(current, ctx.phase.phase);

    if (ps.analysis === undefined) {
      current = await runAnalyse(ctx, current); // first ANALYSE
      continue;
    }

    // analysis present, not ready, ANALYSE budget remains → one follow-up round,
    // then re-ANALYSE. If there is nothing admissible left to ask, proceed
    // regardless rather than trap the user (§8.2 step 3).
    const gaps = selectFollowUpGaps(ps.analysis, ctx.phase.followUpPolicy, ps.followUpsAsked);
    const pending = gaps.filter((gap) => !isAnswered(ps, gap.id, 'followup'));
    if (pending.length === 0) {
      break;
    }
    for (const gap of pending) {
      const value = await askGap(ctx.deps.prompter, gap);
      current = recordFollowUp(ctx, current, gap, value);
    }
    current = await runAnalyse(ctx, current); // re-ANALYSE with the new answers
  }

  return current;
}

async function runAnalyse(ctx: Ctx, session: MustardSession): Promise<MustardSession> {
  const outcome = await ctx.deps.analyse(ctx.phase, session);
  // A degraded ANALYSE (fast model could not produce a valid critique) must not
  // trap the user: treat it as "nothing flagged, ready to synthesise" and move
  // on. A hard network failure throws LlmUnavailableError from the client, which
  // propagates out of runPhase with every answer already persisted (§9.8).
  const analysis: PhaseAnalysis =
    outcome.status === 'ok'
      ? outcome.value
      : { gaps: [], contradictions: [], derivedFacts: [], readyToSynthesise: true };

  return withPhaseSaved(ctx, session, (next, ps) => {
    ps.analysis = analysis;
    ps.analysisRuns += 1;
    if (analysis.derivedFacts.length > 0) {
      const incoming: IncomingFact[] = analysis.derivedFacts.map((f) => ({
        key: f.key,
        value: f.value,
        source: 'derived',
      }));
      applyFacts(next, incoming);
    }
  });
}

// --------------------------------------------------------------------------
// SYNTHESISE → REVIEW → WRITE
// --------------------------------------------------------------------------

type PendingSynthesis = NonNullable<PhaseState['pendingSynthesis']>;

async function runSynthesisAndReview(ctx: Ctx, session: MustardSession): Promise<MustardSession> {
  let current = withPhaseSaved(ctx, session, (_next, ps) => {
    ps.status = 'awaiting_review';
  });

  let steering: 'detail' | 'differently' | undefined;

  while (true) {
    // A persisted pendingSynthesis means SYNTHESISE already completed on a prior
    // run — resume the review where it stopped rather than re-synthesising
    // (§7.3.1: a Ctrl-C mid-review must not cost tokens or change the artifacts).
    if (phaseStateOf(current, ctx.phase.phase).pendingSynthesis === undefined) {
      const outcome = await ctx.deps.synthesise(ctx.phase, current, steering);

      let pending: PendingSynthesis;
      if (outcome.status === 'ok') {
        pending = {
          object: outcome.value.object,
          degraded: false,
          artifacts: outcome.value.artifacts.map((a) => ({ ...a })),
          reviewed: [],
        };
      } else {
        // Degraded fallback (§9.8): render the raw answers under the artifact's
        // headings with `degraded: true`, and say so on screen. No typed object.
        pending = {
          object: undefined,
          degraded: true,
          artifacts: degradedArtifacts(ctx, current),
          reviewed: [],
        };
        ctx.deps.prompter.note(
          `Synthesis fell back to a degraded artifact (${outcome.reason}). The raw answers are recorded; you can edit or redo.`,
          'Degraded',
        );
      }
      current = withPhaseSaved(ctx, current, (_next, ps) => {
        ps.pendingSynthesis = pending;
      });
    }

    const review = await reviewPending(ctx, current);
    current = review.session;
    if (review.redo) {
      steering = review.redo;
      // Discard the rejected synthesis so the next loop iteration regenerates.
      current = withPhaseSaved(ctx, current, (_next, ps) => {
        ps.pendingSynthesis = undefined;
      });
      continue;
    }
    return accept(ctx, current);
  }
}

interface ReviewResult {
  redo?: 'detail' | 'differently';
  session: MustardSession;
}

/**
 * Walk each not-yet-reviewed artifact of the pending synthesis through the review
 * gate; write accepted/edited ones and persist the per-artifact outcome
 * immediately, so resume never re-reviews (or overwrites) an artifact the user
 * already dealt with.
 */
async function reviewPending(ctx: Ctx, session: MustardSession): Promise<ReviewResult> {
  let current = session;

  for (const artifact of pendingOf(current, ctx).artifacts) {
    const reviewed = pendingOf(current, ctx).reviewed.some((r) => r.name === artifact.name);
    if (reviewed) {
      continue;
    }

    const choice = await reviewGate(ctx.deps.prompter, {
      title: artifact.name,
      body: artifact.body,
    });

    if (choice === 'redo-detail') {
      return { redo: 'detail', session: current };
    }
    if (choice === 'redo-differently') {
      return { redo: 'differently', session: current };
    }

    let body = artifact.body;
    let edited = false;
    if (choice === 'edit') {
      // The edited markdown becomes canonical for this artifact; the typed object
      // is still retained downstream, with the `edited` flag marking the drift.
      body = await ctx.editor.launch(artifact.body);
      edited = true;
    }
    ctx.io.writeArtifact(artifact.name, body);
    current = withPhaseSaved(ctx, current, (_next, ps) => {
      const pending = ps.pendingSynthesis;
      if (pending === undefined) {
        throw new Error('pendingSynthesis vanished mid-review — this is a bug.');
      }
      const stored = pending.artifacts.find((a) => a.name === artifact.name);
      if (stored) {
        stored.body = body; // keep session state matching what is on disk
      }
      pending.reviewed.push({ name: artifact.name, edited });
    });
  }

  return { session: current };
}

function pendingOf(session: MustardSession, ctx: Ctx): PendingSynthesis {
  const pending = phaseStateOf(session, ctx.phase.phase).pendingSynthesis;
  if (pending === undefined) {
    throw new Error('No pendingSynthesis to review — SYNTHESISE should have persisted one.');
  }
  return pending;
}

/**
 * Mark the phase accepted from its fully-reviewed pending synthesis: retain the
 * object, record artifacts, clear the in-flight state, advance.
 */
function accept(ctx: Ctx, session: MustardSession): MustardSession {
  return withPhaseSaved(ctx, session, (next, ps) => {
    const pending = ps.pendingSynthesis;
    ps.status = 'accepted';
    ps.acceptedAt = ctx.now();
    ps.artifactPaths = pending?.artifacts.map((a) => a.name) ?? [];
    ps.edited = pending?.reviewed.some((r) => r.edited) ?? false;
    ps.synthesisedObject = pending?.object;
    ps.pendingSynthesis = undefined;
    next.currentPhase = Math.max(next.currentPhase, ctx.phase.phase + 1);
  });
}

// --------------------------------------------------------------------------
// Prompting helpers (bank Question + generated Gap → an answer value)
// --------------------------------------------------------------------------

type AnswerValue = Answer['value'];

async function ask(
  prompter: Prompter,
  question: Question,
  literacy: MustardSession['literacy'],
): Promise<AnswerValue> {
  const message = resolvePrompt(question, literacy);
  const help = question.help;
  switch (question.type) {
    case 'select':
      return prompter.select({ message, help, options: question.options ?? [] });
    case 'multiselect':
      return prompter.multiselect({ message, help, options: question.options ?? [] });
    case 'text':
      return prompter.text({ message, help, validate: buildValidate(question) });
    case 'editor':
      return prompter.editor({ message, help, validate: buildValidate(question) });
    case 'confirm':
      return prompter.confirm({ message, help });
  }
}

async function askGap(
  prompter: Prompter,
  gap: { suggestedQuestion: string; suggestedType: Question['type']; suggestedOptions?: string[] },
): Promise<AnswerValue> {
  const message = gap.suggestedQuestion;
  const options = (gap.suggestedOptions ?? []).map((value) => ({ value, label: value }));
  switch (gap.suggestedType) {
    case 'select':
      return prompter.select({ message, options });
    case 'multiselect':
      return prompter.multiselect({ message, options });
    case 'text':
      return prompter.text({ message });
    case 'editor':
      return prompter.editor({ message });
    case 'confirm':
      return prompter.confirm({ message });
  }
}

/** Derive a clack validator from a bank question's `EditorValidation`. */
function buildValidate(question: Question): ((value: string) => string | undefined) | undefined {
  const min = question.validation?.minWords;
  if (min === undefined) {
    return undefined;
  }
  return (value) => {
    const words = value.trim().split(/\s+/).filter(Boolean).length;
    return words >= min ? undefined : `Please write at least ${min} words (you wrote ${words}).`;
  };
}

// --------------------------------------------------------------------------
// Answer persistence
// --------------------------------------------------------------------------

function recordAnswer(
  ctx: Ctx,
  session: MustardSession,
  question: Question,
  value: AnswerValue,
  source: 'seed' | 'followup',
): MustardSession {
  return withPhaseSaved(ctx, session, (next, ps) => {
    ps.answers.push({
      questionId: question.id,
      type: question.type,
      value,
      source,
      askedAt: ctx.now(),
    });
    if (question.mapsTo !== undefined) {
      applyFacts(next, [
        { key: question.mapsTo, value: value as IncomingFact['value'], source: 'answer' },
      ]);
    }
  });
}

function recordFollowUp(
  ctx: Ctx,
  session: MustardSession,
  gap: { id: string; suggestedType: Question['type'] },
  value: AnswerValue,
): MustardSession {
  return withPhaseSaved(ctx, session, (_next, ps) => {
    ps.answers.push({
      questionId: gap.id,
      type: gap.suggestedType,
      value,
      source: 'followup',
      askedAt: ctx.now(),
    });
    ps.followUpsAsked += 1;
  });
}

// --------------------------------------------------------------------------
// Degraded fallback renderer (phase-agnostic; real renderers arrive M6/M7)
// --------------------------------------------------------------------------

function degradedArtifacts(
  ctx: Ctx,
  session: MustardSession,
): Array<{ name: string; body: string }> {
  const ps = phaseStateOf(session, ctx.phase.phase);
  const answerLines = ps.answers
    .map((a) => `- **${a.questionId}**: ${formatValue(a.value)}`)
    .join('\n');
  const names = ctx.phase.synthesis?.artifacts ?? [];
  // Degraded artifacts still carry the full standard frontmatter (§9.7) so drift
  // detection (v0.3) can correlate them; `degraded: true` flags the fallback.
  const meta: FrontmatterMeta = {
    phase: ctx.phase.phase,
    sessionId: deriveSessionId(session),
    generatedAt: ctx.now(),
    mustardVersion: ctx.mustardVersion,
    degraded: true,
  };
  return names.map((name) => ({
    name,
    body: withFrontmatter(
      meta,
      `# ${titleFor(name)}\n\n> Generated in degraded mode — synthesis failed, so the raw answers are recorded below for you to edit.\n\n## Answers\n\n${answerLines}\n`,
    ),
  }));
}

function titleFor(artifactName: string): string {
  return artifactName.replace(/\.md$/i, '');
}

function formatValue(value: AnswerValue): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

// --------------------------------------------------------------------------
// Session/phase mutation helpers (immutable: clone → mutate → save)
// --------------------------------------------------------------------------

/** `withPhase` followed by an immediate persist — the durability boundary. */
function withPhaseSaved(
  ctx: Ctx,
  session: MustardSession,
  mutate: (next: MustardSession, ps: PhaseState) => void,
): MustardSession {
  return ctx.save(withPhase(session, ctx.phase.phase, mutate));
}
