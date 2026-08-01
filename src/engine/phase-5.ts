import type { AnalyseFn } from '../engine/runner.js';
import type { SynthesiseArchitectureFn } from '../llm/passes/synthesise-architecture.js';
import { phase5 } from '../questions/bank/phase-5.js';
import { resolvePrompt } from '../questions/index.js';
import type { Question } from '../questions/types.js';
import { deriveSessionId } from '../render/markdown/frontmatter.js';
import { createRendererRegistry } from '../render/register.js';
import type { RendererRegistry } from '../render/registry.js';
import type { Gap } from '../schemas/analysis.js';
import type { Architecture, Phase5Output } from '../schemas/architecture.js';
import { Phase5Output as Phase5OutputSchema } from '../schemas/architecture.js';
import { Phase2Output } from '../schemas/phase2-output.js';
import type { MustardSession, PhaseState } from '../schemas/session.js';
import { type EditorLauncher, defaultEditorLauncher } from '../ui/editor.js';
import type { Prompter } from '../ui/prompter.js';
import { readVersion } from '../version.js';
import { selectFollowUpGaps } from './budget.js';
import { type IncomingFact, applyFacts } from './facts.js';
import {
  type RunnerIO,
  fileArtifactIO,
  isAnswered,
  makeAnswer,
  phaseStateOf,
  withPhase,
} from './orchestrator.js';
import { saveSession } from './session.js';

/**
 * Phase 5 — Architecture (spec §8.8, technical-plan §5, M12). "Mostly derived":
 * Phase 5 asks only the two seed questions the earlier phases cannot answer, runs
 * one capped ANALYSE/FOLLOW-UP round, then the deep `synthesise-architecture`
 * pass turns Phases 2–4 into a component graph, the riskiest sequence diagrams,
 * an ADR log, and the three irreversible decisions. Each irreversible decision is
 * confirmed ONE AT A TIME at the irreversibility gate (§8.8); the gate is
 * NON-BLOCKING (technical-plan §M12) — declining records `confirmed: false` and
 * the phase still advances. Emits `05-ARCHITECTURE.md` and `05-DECISIONS.md`.
 *
 * Like Phase 2/3/4 this is a BESPOKE orchestrator: the per-decision confirm gate
 * is not the generic full-artifact review gate, so it does not fit `runPhase`.
 * Question STRINGS still live in the bank (the M2 tripwire holds); only the flow
 * lives here.
 *
 * The gate runs BEFORE the write step so `05-DECISIONS.md` renders with the
 * confirmations present — the artifacts stay a pure render of a fully-populated
 * `Phase5Output`.
 *
 * Idempotent, answer-level resume (pitfall §7.5): position is re-derived from
 * marker answers and the stored analysis, never an internal cursor:
 *   - each `p5.<seed-id>` → one seed question
 *   - `PhaseState.analysis` present → the capped ANALYSE round has run
 *   - `p5.synthesised`    → the deep synthesis call; object stored
 *   - `p5.irr.<i>` per dec → one irreversibility confirm recorded
 *   - `p5.write`          → render, review, write both artifacts, accept
 * A Ctrl-C loses nothing and never re-runs a pass whose result is already stored.
 */

export interface RunPhase5Deps {
  prompter: Prompter;
  /** Phase 5 ANALYSE pass (fast) — one capped follow-up round. */
  analyse: AnalyseFn;
  /** Phase 5 architecture-synthesis pass (deep). */
  synthesiseArchitecture: SynthesiseArchitectureFn;
  /** Where the artifacts are written. Defaults to `mustard/` in the cwd. */
  io?: RunnerIO;
  /** Defaults to `$EDITOR` via `defaultEditorLauncher`. */
  editor?: EditorLauncher;
  /** Renderer registry. Defaults to the production registry. */
  registry?: RendererRegistry;
  /** Package version for artifact frontmatter. Defaults to the runtime version. */
  mustardVersion?: string;
  /** ISO clock for `askedAt`/`acceptedAt`/`generated_at`. Injectable for tests. */
  now?: () => string;
  /** Persist step. Defaults to `saveSession` (atomic write + `.bak`). */
  save?: (session: MustardSession) => MustardSession;
}

const PHASE = 5;
const SYNTHESISED = 'p5.synthesised';
const WRITE_DONE = 'p5.write';
const irrMarker = (index: number): string => `p5.irr.${index}`;

const REVIEW_CHOICES = [
  { value: 'accept', label: 'Accept — write it and move on' },
  { value: 'edit', label: 'Edit in $EDITOR' },
];

export async function runPhase5(
  session: MustardSession,
  deps: RunPhase5Deps,
): Promise<MustardSession> {
  const now = deps.now ?? (() => new Date().toISOString());
  const save = deps.save ?? ((s: MustardSession) => saveSession(s));
  const io = deps.io ?? fileArtifactIO();
  const editor = deps.editor ?? defaultEditorLauncher;
  const registry = deps.registry ?? createRendererRegistry();
  const mustardVersion = deps.mustardVersion ?? readVersion();
  const { prompter } = deps;

  let current = save(
    withPhase(session, PHASE, (_next, ps) => {
      if (ps.status === 'pending') {
        ps.status = 'in_progress';
      }
    }),
  );

  // 1. SEED — ask the two derived-architecture questions (§8.8). Static bank
  // questions; only the flow is here. Persist each answer and map it to `arch.*`
  // facts so the synthesis pass reads them.
  for (const question of phase5.seed) {
    if (question.when && !question.when(current.facts)) {
      continue;
    }
    if (isAnswered(phaseState(current), question.id)) {
      continue;
    }
    const value = await askSeedQuestion(prompter, question, current.literacy);
    current = save(
      withPhase(current, PHASE, (next, ps) => {
        ps.answers.push(makeAnswer(question.id, question.type, value, 'seed', now()));
        if (question.mapsTo !== undefined) {
          const incoming: IncomingFact[] = [{ key: question.mapsTo, value, source: 'answer' }];
          applyFacts(next, incoming);
        }
      }),
    );
  }

  // 2. ANALYSE — one fast call, guarded on the stored analysis so resume never
  // re-invokes it. A degraded analysis is treated as "nothing flagged" (§8.2).
  if (phaseState(current).analysis === undefined) {
    const outcome = await deps.analyse(phase5, current);
    const analysis =
      outcome.status === 'ok'
        ? outcome.value
        : { gaps: [], contradictions: [], derivedFacts: [], readyToSynthesise: true };
    current = save(
      withPhase(current, PHASE, (next, ps) => {
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
      }),
    );
  }

  // 3. FOLLOW-UP — one capped round (never trap the user; repetition is a
  // wandering interrogation — §8.8). Each gap guarded by `isAnswered` so resume
  // asks only the unanswered ones.
  {
    const analysis = phaseState(current).analysis;
    const gaps = analysis
      ? selectFollowUpGaps(analysis, phase5.followUpPolicy, phaseState(current).followUpsAsked)
      : [];
    for (const gap of gaps) {
      if (isAnswered(phaseState(current), gap.id, 'followup')) {
        continue;
      }
      const value = await askGap(prompter, gap);
      current = save(
        withPhase(current, PHASE, (_next, ps) => {
          ps.answers.push(makeAnswer(gap.id, gap.suggestedType, value, 'followup', now()));
          ps.followUpsAsked += 1;
        }),
      );
    }
  }

  // 4. SYNTHESISE — one deep call turns Phases 2–4 into the architecture. Resolve
  // the selected use cases now so the renderers stay pure. A degraded outcome
  // falls back to an empty architecture (§9.8) rather than trapping the user.
  if (!isAnswered(phaseState(current), SYNTHESISED)) {
    const outcome = await deps.synthesiseArchitecture(current);
    const stored =
      outcome.status === 'ok' ? toPhase5Output(outcome.value, current) : emptyPhase5Output();
    current = save(
      withPhase(current, PHASE, (_next, ps) => {
        ps.synthesisedObject = stored;
        ps.answers.push(makeAnswer(SYNTHESISED, 'proposal', true, 'derived', now()));
      }),
    );
  }

  // 5. IRREVERSIBILITY GATE — present each of the three decisions and confirm it
  // individually (§8.8). Non-blocking: a decline records `confirmed: false` and
  // the phase still advances. Each confirm is persisted immediately, so a Ctrl-C
  // between confirms loses nothing and never re-asks a resolved one.
  const decisionCount = readOutput(phaseState(current)).irreversibleDecisions.length;
  for (let i = 0; i < decisionCount; i++) {
    const marker = irrMarker(i);
    if (isAnswered(phaseState(current), marker)) {
      continue;
    }
    const decision = readOutput(phaseState(current)).irreversibleDecisions[i];
    if (decision === undefined) {
      throw new Error(`Phase 5 irreversible decision ${i} vanished from the stored architecture.`);
    }
    prompter.note(
      `${decision.plainLanguage}\n\nIf you change this later: ${decision.consequence}`,
      decision.title,
    );
    const confirmed = await prompter.confirm({
      message: 'This is expensive to reverse. Confirm you understand and want to lock it in?',
    });
    current = save(
      withPhase(current, PHASE, (_next, ps) => {
        const out = readOutput(ps);
        out.confirmations.push({ decisionId: decision.id, confirmed, confirmedAt: now() });
        ps.synthesisedObject = out;
        ps.answers.push(makeAnswer(marker, 'confirm', confirmed, 'derived', now()));
      }),
    );
  }

  // 6. WRITE — render both artifacts against the confirmed architecture, review
  // each, write, accept the phase, advance the mission.
  if (!isAnswered(phaseState(current), WRITE_DONE)) {
    const artifacts = phase5.synthesis?.artifacts ?? [];
    const output = readOutput(phaseState(current));
    const rendered = registry.renderAll(artifacts, output, {
      phase: PHASE,
      sessionId: deriveSessionId(current),
      generatedAt: now(),
      mustardVersion,
    });

    let anyEdited = false;
    for (const artifact of rendered) {
      prompter.note(artifact.body, artifact.name);
      const choice = await prompter.select({
        message: 'How does this look?',
        options: REVIEW_CHOICES,
      });
      let body = artifact.body;
      if (choice === 'edit') {
        body = await editor.launch(artifact.body);
        anyEdited = true;
      }
      io.writeArtifact(artifact.name, body);
    }

    current = save(
      withPhase(current, PHASE, (next, ps) => {
        ps.status = 'accepted';
        ps.acceptedAt = now();
        ps.artifactPaths = [...artifacts];
        ps.edited = anyEdited;
        ps.answers.push(makeAnswer(WRITE_DONE, 'confirm', true, 'derived', now()));
        next.currentPhase = Math.max(next.currentPhase, PHASE + 1);
      }),
    );
  }

  return current;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Phase 5's state (throwing getter), phase-bound for the many call sites. */
function phaseState(session: MustardSession): PhaseState {
  return phaseStateOf(session, PHASE);
}

/** Read and validate the working Phase5Output. Only valid after the SYNTHESISE step. */
function readOutput(ps: PhaseState): Phase5Output {
  if (ps.synthesisedObject === undefined) {
    throw new Error('Phase 5 output missing — the SYNTHESISE step must run first.');
  }
  return Phase5OutputSchema.parse(ps.synthesisedObject);
}

/**
 * Turn the strict pass output into the stored `Phase5Output`: resolve each
 * `sequenceSelections[].useCaseId` to its Phase 2 `UseCase` so the renderer stays
 * a pure function of its object. An unknown id is a loud bug, not a silent skip.
 */
function toPhase5Output(architecture: Architecture, session: MustardSession): Phase5Output {
  const useCases = Phase2Output.parse(phaseStateOf(session, 2).synthesisedObject).useCases;
  const byId = new Map(useCases.map((uc) => [uc.id, uc]));
  const selectedUseCases = architecture.sequenceSelections.map((selection) => {
    const useCase = byId.get(selection.useCaseId);
    if (useCase === undefined) {
      throw new Error(
        `Phase 5 sequence selection references unknown use case "${selection.useCaseId}".`,
      );
    }
    return useCase;
  });
  return {
    componentGraph: architecture.componentGraph,
    sequenceSelections: architecture.sequenceSelections,
    selectedUseCases,
    adrs: architecture.adrs,
    irreversibleDecisions: architecture.irreversibleDecisions,
    confirmations: [],
  };
}

/** The degraded fallback: an empty architecture the renderers show as "none" (§9.8). */
function emptyPhase5Output(): Phase5Output {
  return {
    componentGraph: { components: [], connections: [] },
    sequenceSelections: [],
    selectedUseCases: [],
    adrs: [],
    irreversibleDecisions: [],
    confirmations: [],
  };
}

/** Ask one seed question, resolving its prompt for the literacy register (bank strings only). */
async function askSeedQuestion(
  prompter: Prompter,
  question: Question,
  literacy: MustardSession['literacy'],
): Promise<string | string[] | boolean> {
  const message = resolvePrompt(question, literacy);
  const help = question.help;
  const withHelp = help !== undefined ? { help } : {};
  switch (question.type) {
    case 'select':
      return prompter.select({ message, ...withHelp, options: question.options ?? [] });
    case 'multiselect':
      return prompter.multiselect({ message, ...withHelp, options: question.options ?? [] });
    case 'confirm':
      return prompter.confirm({ message, ...withHelp });
    case 'text':
      return prompter.text({ message, ...withHelp });
    case 'editor':
      return prompter.editor({ message, ...withHelp });
  }
}

/** Ask one generated follow-up gap (mirrors the runner's `askGap`). */
async function askGap(prompter: Prompter, gap: Gap): Promise<string | string[] | boolean> {
  const message = gap.suggestedQuestion;
  const options = (gap.suggestedOptions ?? []).map((value) => ({ value, label: value }));
  switch (gap.suggestedType) {
    case 'select':
      return prompter.select({ message, options });
    case 'multiselect':
      return prompter.multiselect({ message, options });
    case 'confirm':
      return prompter.confirm({ message });
    case 'text':
      return prompter.text({ message });
    case 'editor':
      return prompter.editor({ message });
  }
}
