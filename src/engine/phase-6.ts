import type { SequenceFn } from '../llm/passes/sequence.js';
import { phase6 } from '../questions/bank/phase-6.js';
import { resolvePrompt } from '../questions/index.js';
import type { Question } from '../questions/types.js';
import { deriveSessionId } from '../render/markdown/frontmatter.js';
import { createRendererRegistry } from '../render/register.js';
import type { RendererRegistry } from '../render/registry.js';
import type { Gap } from '../schemas/analysis.js';
import { type Phase6Output, Phase6Output as Phase6OutputSchema } from '../schemas/roadmap.js';
import type { MustardSession, PhaseState } from '../schemas/session.js';
import type { Task } from '../schemas/task.js';
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
import type { AnalyseFn } from './runner.js';
import { saveSession } from './session.js';
import { repairOrder } from './topo.js';

/**
 * Phase 6 — Roadmap (spec §8.9, technical-plan §5, M13). By now the product is
 * fully specified, so Phase 6 asks only the two things nothing else can supply —
 * hours per week and testing policy — then runs the FULL generic-shaped round
 * (SEED → ANALYSE → capped FOLLOW-UP → SYNTHESISE → REVIEW → WRITE) so the analysis
 * pass can catch a missing constraint before the deep `sequence` pass sizes tasks.
 *
 * The `sequence` pass chunks and sizes the work; DETERMINISTIC code here owns the
 * topology — `repairOrder` sorts the tasks by their `dependsOn` edges, so the
 * "valid topological ordering" golden rubric (§10) holds by construction. The
 * ordered tasks are written to `session.tasks` for Phase 7 and `mustard prompts`.
 *
 * A BESPOKE orchestrator (like Phases 3–5): question STRINGS live in the bank (the
 * M2 tripwire holds), only the flow lives here. Emits `06-ROADMAP.md`.
 *
 * Idempotent, answer-level resume (pitfall §7.5): position is re-derived from
 * marker answers and the stored analysis, never an internal cursor:
 *   - each `p6.<seed-id>` → one seed question
 *   - `PhaseState.analysis` present → the capped ANALYSE round has run
 *   - `p6.synthesised`    → the deep sequence call; tasks stored and mirrored
 *   - `p6.write`          → render, review, write the artifact, accept
 */

export interface RunPhase6Deps {
  prompter: Prompter;
  /** Phase 6 ANALYSE pass (fast) — one capped follow-up round. */
  analyse: AnalyseFn;
  /** Phase 6 task-sequencing pass (deep). */
  sequence: SequenceFn;
  /** Where the artifact is written. Defaults to `mustard/` in the cwd. */
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

const PHASE = 6;
const SYNTHESISED = 'p6.synthesised';
const WRITE_DONE = 'p6.write';

const REVIEW_CHOICES = [
  { value: 'accept', label: 'Accept — write it and move on' },
  { value: 'edit', label: 'Edit in $EDITOR' },
];

export async function runPhase6(
  session: MustardSession,
  deps: RunPhase6Deps,
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

  // 1. SEED — ask the two questions nothing else can answer (§8.9). Static bank
  // questions; only the flow is here. Persist each answer and map it to a
  // `roadmap.*` fact the sequence pass reads.
  for (const question of phase6.seed) {
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
    const outcome = await deps.analyse(phase6, current);
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

  // 3. FOLLOW-UP — one capped round (never trap the user — §8.2 step 3). Each gap
  // guarded by `isAnswered` so resume asks only the unanswered ones.
  {
    const analysis = phaseState(current).analysis;
    const gaps = analysis
      ? selectFollowUpGaps(analysis, phase6.followUpPolicy, phaseState(current).followUpsAsked)
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

  // 4. SYNTHESISE — one deep call sizes the tasks; deterministic code orders them.
  // A degraded outcome falls back to an empty roadmap (§9.8). The ordered tasks are
  // stored in `synthesisedObject` AND mirrored into `session.tasks`.
  if (!isAnswered(phaseState(current), SYNTHESISED)) {
    const outcome = await deps.sequence(current);
    const orderedTasks = outcome.status === 'ok' ? orderTasks(outcome.value.tasks) : ([] as Task[]);
    const output: Phase6Output = {
      orderedTasks,
      hoursPerWeek: String(current.facts['roadmap.hoursPerWeek'] ?? ''),
      testingPolicy: String(current.facts['roadmap.testingPolicy'] ?? ''),
    };
    current = save(
      withPhase(current, PHASE, (next, ps) => {
        ps.synthesisedObject = output;
        next.tasks = orderedTasks;
        ps.answers.push(makeAnswer(SYNTHESISED, 'proposal', true, 'derived', now()));
      }),
    );
  }

  // 5. REVIEW + WRITE — render the roadmap, review it, write, accept, advance.
  if (!isAnswered(phaseState(current), WRITE_DONE)) {
    const artifacts = phase6.synthesis?.artifacts ?? [];
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

/** Phase 6's state (throwing getter), phase-bound for the several call sites. */
function phaseState(session: MustardSession): PhaseState {
  return phaseStateOf(session, PHASE);
}

/** Read and validate the working Phase6Output. Only valid after the SYNTHESISE step. */
function readOutput(ps: PhaseState): Phase6Output {
  if (ps.synthesisedObject === undefined) {
    throw new Error('Phase 6 output missing — the SYNTHESISE step must run first.');
  }
  return Phase6OutputSchema.parse(ps.synthesisedObject);
}

/**
 * Deterministically order the sequenced tasks by their `dependsOn` edges (§8.9:
 * "deterministic code owns the topology"). `repairOrder` respects the ids the pass
 * emitted, and a cycle never dead-ends — the offending tasks are appended in
 * original order. Each task is stamped `status: 'todo'`.
 */
function orderTasks(sequenced: readonly Omit<Task, 'status'>[]): Task[] {
  const byId = new Map(sequenced.map((t) => [t.id, { ...t, status: 'todo' as const }]));
  const order = repairOrder(
    sequenced.map((t) => t.id),
    sequenced,
  );
  return order.map((id) => {
    const task = byId.get(id);
    if (task === undefined) {
      throw new Error(`Task order referenced unknown id "${id}".`);
    }
    return task;
  });
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
