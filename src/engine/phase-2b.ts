import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FailureQuestionsFn } from '../llm/passes/failure-questions.js';
import type {
  FailureAnswer,
  FailurePath,
  FailureStructureFn,
} from '../llm/passes/failure-structure.js';
import type { HappyPathFn, HappyStep } from '../llm/passes/happy-path.js';
import type { OrderUseCasesFn } from '../llm/passes/order-use-cases.js';
import { phase2 } from '../questions/bank/phase-2.js';
import { resolvePrompt } from '../questions/index.js';
import { deriveSessionId } from '../render/markdown/frontmatter.js';
import { createRendererRegistry } from '../render/register.js';
import type { RendererRegistry } from '../render/registry.js';
import { DomainExtraction } from '../schemas/extraction.js';
import { Phase2Output } from '../schemas/phase2-output.js';
import type { Answer, MustardSession, PhaseState } from '../schemas/session.js';
import type { UseCase } from '../schemas/use-case.js';
import { type EditorLauncher, defaultEditorLauncher } from '../ui/editor.js';
import type { Prompter } from '../ui/prompter.js';
import { readVersion } from '../version.js';
import { type IncomingFact, mergeFacts } from './facts.js';
import {
  deriveScreens,
  fallbackFailurePath,
  parseHappyPathText,
  renderHappyPathForEdit,
  seedUseCases,
  setDependencyOrder,
  setFailurePaths,
  setHappyPath,
  setScreens,
  wrapExtraction,
} from './phase-2b-edit.js';
import { orderTitlesToIds, repairOrder, topoOrder } from './phase-2b-order.js';
import type { RunnerIO } from './runner.js';
import { mustardDir, saveSession } from './session.js';

/**
 * Phase 2, part B (spec §8.5 steps 5–8; technical-plan §5, M9): happy paths → the
 * signature failure interrogation → dependency ordering → the UI step → the
 * `02-USE-CASES.md` synthesis. Like part A this is a BESPOKE orchestrator (§8.5 does
 * not fit the generic `runPhase` machine): four LLM passes and a deterministic render
 * replace SEED → ANALYSE → SYNTHESISE. Part A leaves a confirmed `DomainExtraction`
 * in `PhaseState.synthesisedObject`; part B wraps it into a `Phase2Output`, fills it,
 * renders it, and marks the phase `accepted`.
 *
 * Question STRINGS still come from the bank (the UI approach select in `phase-2.ts`)
 * or a versioned prompt; only the flow lives here (the M2 tripwire holds).
 *
 * Idempotent, answer-level resume (pitfall §7.5): position is re-derived from marker
 * answers in `PhaseState`, never an internal cursor:
 *   - `p2b.seeded` absent      → wrap the extraction into a `Phase2Output`
 *   - `p2.happy.<uc>` per uc    → draft + accept/edit the happy path
 *   - `p2.fail.<uc>` per uc     → failure questions → answers → structured failure paths
 *   - `p2.deporder`            → propose + confirm the build order
 *   - `p2.ui.approach` / `p2.ui.screens` → the UI step
 *   - `p2.write`               → render, review, write `02-USE-CASES.md`, accept
 * A Ctrl-C loses nothing and never re-runs a pass for a use case already completed.
 *
 * NOTE for M10: once part B has run, `synthesisedObject` is a `Phase2Output`, not a
 * bare `DomainExtraction`. Phase 3 must read entities via `Phase2Output.extraction`.
 * The `driveMission` gate skips part A once `p2b.seeded` is set, so part A never
 * re-reads a wrapped object.
 */

export interface RunPhase2BDeps {
  prompter: Prompter;
  happyPath: HappyPathFn;
  failureQuestions: FailureQuestionsFn;
  failureStructure: FailureStructureFn;
  orderUseCases: OrderUseCasesFn;
  /** Where `02-USE-CASES.md` is written. Defaults to `mustard/` in the cwd. */
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

const PHASE = 2;
const ARTIFACT = '02-USE-CASES.md';
const SEEDED = 'p2b.seeded';
const ORDER_DONE = 'p2.deporder';
const UI_APPROACH = 'p2.ui.approach';
const UI_SCREENS = 'p2.ui.screens';
const WRITE_DONE = 'p2.write';
const happyMarker = (id: string): string => `p2.happy.${id}`;
const failMarker = (id: string): string => `p2.fail.${id}`;

const ACCEPT_EDIT = [
  { value: 'accept', label: 'Accept' },
  { value: 'edit', label: 'Edit in $EDITOR' },
];
const REVIEW_CHOICES = [
  { value: 'accept', label: 'Accept — write it and move on' },
  { value: 'edit', label: 'Edit in $EDITOR' },
];

export async function runPhase2B(
  session: MustardSession,
  deps: RunPhase2BDeps,
): Promise<MustardSession> {
  const now = deps.now ?? (() => new Date().toISOString());
  const save = deps.save ?? ((s: MustardSession) => saveSession(s));
  const io = deps.io ?? fileArtifactIO();
  const editor = deps.editor ?? defaultEditorLauncher;
  const registry = deps.registry ?? createRendererRegistry();
  const mustardVersion = deps.mustardVersion ?? readVersion();
  const { prompter } = deps;

  let current = save(
    withPhase2(session, (_next, ps) => {
      if (ps.status === 'pending') {
        ps.status = 'in_progress';
      }
    }),
  );

  // 0. SEED — wrap the part-A extraction into the working Phase2Output (idempotent).
  if (!isAnswered(phase2State(current), SEEDED)) {
    const extraction = DomainExtraction.parse(phase2State(current).synthesisedObject);
    const output = wrapExtraction(extraction);
    current = save(
      withPhase2(current, (_next, ps) => {
        ps.synthesisedObject = output;
        ps.answers.push(answer(SEEDED, 'confirm', true, 'derived', now()));
      }),
    );
  }

  // Ids/titles/actors are stable from here; capture them once for the loops.
  const useCases = readOutput(phase2State(current)).useCases;

  // 1. HAPPY PATH — per use case (§8.5 step 5), accept-or-edit. Persisted per uc.
  for (const uc of useCases) {
    if (isAnswered(phase2State(current), happyMarker(uc.id))) {
      continue;
    }
    const output = readOutput(phase2State(current));
    const actor = resolveActor(output, uc.actorId);
    const outcome = await deps.happyPath(current, uc, actor);
    let steps: HappyStep[] = outcome.status === 'ok' ? outcome.value : [];

    const draft = renderHappyPathForEdit(steps);
    prompter.note(
      draft.length > 0 ? draft : '(no draft — add the steps yourself)',
      `Happy path — ${uc.title}`,
    );
    const choice = await prompter.select({
      message: `Use this happy path for "${uc.title}"?`,
      options: ACCEPT_EDIT,
    });
    if (choice === 'edit') {
      steps = parseHappyPathText(await editor.launch(draft));
    }

    current = save(
      withPhase2(current, (_next, ps) => {
        ps.synthesisedObject = setHappyPath(readOutput(ps), uc.id, steps);
        ps.answers.push(answer(happyMarker(uc.id), 'confirm', true, 'derived', now()));
      }),
    );
  }

  // 2. FAILURE INTERROGATION — the signature feature (§8.5 step 6). Two fast passes
  // per use case: generate questions → user answers → structure into failure paths.
  // Persisted per uc, and every use case ends with ≥ 1 failure path by construction.
  for (const uc of useCases) {
    if (isAnswered(phase2State(current), failMarker(uc.id))) {
      continue;
    }
    const output = readOutput(phase2State(current));
    const freshUc = output.useCases.find((u) => u.id === uc.id) ?? uc;
    const actor = resolveActor(output, freshUc.actorId);

    const qOutcome = await deps.failureQuestions(current, freshUc, { name: actor.name });
    const questions = qOutcome.status === 'ok' ? qOutcome.value : [];

    let paths: FailurePath[];
    if (questions.length === 0) {
      paths = [fallbackFailurePath()];
    } else {
      const items: FailureAnswer[] = [];
      for (const q of questions) {
        const value = await prompter.text({ message: q.question });
        items.push({ trigger: q.trigger, question: q.question, answer: value });
      }
      const sOutcome = await deps.failureStructure(current, freshUc, items);
      paths =
        sOutcome.status === 'ok' && sOutcome.value.length > 0
          ? sOutcome.value
          : items.map((i) => ({ trigger: i.trigger, systemResponse: '', userVisible: i.answer }));
      if (paths.length === 0) {
        paths = [fallbackFailurePath()];
      }
    }

    current = save(
      withPhase2(current, (_next, ps) => {
        ps.synthesisedObject = setFailurePaths(readOutput(ps), uc.id, paths);
        ps.answers.push(answer(failMarker(uc.id), 'confirm', true, 'derived', now()));
      }),
    );
  }

  // 3. DEPENDENCY ORDER — LLM proposes, user confirms (§8.5 step 7). Feeds Phase 6.
  if (!isAnswered(phase2State(current), ORDER_DONE)) {
    const output = readOutput(phase2State(current));
    const outcome = await deps.orderUseCases(current, output.useCases);
    const titles = outcome.status === 'ok' ? outcome.value : [];
    const proposed = repairOrder(orderTitlesToIds(titles, output.useCases), output.useCases);

    prompter.note(renderProposedOrder(proposed, output.useCases), 'Proposed build order');
    const ok = await prompter.confirm({ message: 'Does this build order look right?' });
    const finalOrder = ok ? proposed : topoOrder(output.useCases);

    current = save(
      withPhase2(current, (_next, ps) => {
        ps.synthesisedObject = setDependencyOrder(readOutput(ps), finalOrder);
        ps.answers.push(answer(ORDER_DONE, 'confirm', ok, 'derived', now()));
      }),
    );
  }

  // 4a. UI — design approach (bank question, §8.5 step 8).
  if (!isAnswered(phase2State(current), UI_APPROACH)) {
    const q = phase2.seed.find((s) => s.id === UI_APPROACH);
    if (q === undefined) {
      throw new Error('phase-2 bank is missing the UI approach question.');
    }
    const value = await prompter.select({
      message: resolvePrompt(q, current.literacy),
      ...(q.help !== undefined ? { help: q.help } : {}),
      options: q.options ?? [],
    });
    current = save(
      withPhase2(current, (next, ps) => {
        ps.answers.push(answer(UI_APPROACH, 'select', value, 'seed', now()));
        if (q.mapsTo !== undefined) {
          next.facts = mergeFacts(next.facts, [
            { key: q.mapsTo, value, source: 'answer' },
          ]) as MustardSession['facts'];
        }
      }),
    );
  }

  // 4b. UI — screen inventory, derived from the use cases (§8.5 step 8).
  if (!isAnswered(phase2State(current), UI_SCREENS)) {
    const output = readOutput(phase2State(current));
    const candidates = deriveScreens(output.useCases);
    const picked =
      candidates.length > 0
        ? await prompter.multiselect({
            message: 'Which screens will you need? Select all that apply.',
            options: candidates.map((s) => ({ value: s, label: s })),
          })
        : [];
    const custom = splitList(
      await prompter.text({
        message: 'Any other screens? Separate with commas, or leave blank.',
      }),
    );
    const screens = [...picked, ...custom];
    const approach = readApproach(phase2State(current));
    current = save(
      withPhase2(current, (_next, ps) => {
        ps.synthesisedObject = setScreens(readOutput(ps), approach, screens);
        ps.answers.push(answer(UI_SCREENS, 'multiselect', screens, 'seed', now()));
      }),
    );
  }

  // 5. WRITE — render `02-USE-CASES.md`, review (accept / edit), write, accept phase.
  if (!isAnswered(phase2State(current), WRITE_DONE)) {
    const output = readOutput(phase2State(current));
    const rendered = registry.render(ARTIFACT, output, {
      phase: PHASE,
      sessionId: deriveSessionId(current),
      generatedAt: now(),
      mustardVersion,
    });

    prompter.note(rendered.body, rendered.name);
    const choice = await prompter.select({
      message: 'How does this look?',
      options: REVIEW_CHOICES,
    });

    let body = rendered.body;
    let edited = false;
    if (choice === 'edit') {
      body = await editor.launch(rendered.body);
      edited = true;
    }
    io.writeArtifact(rendered.name, body);

    current = save(
      withPhase2(current, (next, ps) => {
        ps.status = 'accepted';
        ps.acceptedAt = now();
        ps.artifactPaths = [ARTIFACT];
        ps.edited = edited;
        ps.answers.push(answer(WRITE_DONE, 'confirm', true, 'derived', now()));
        next.currentPhase = Math.max(next.currentPhase, PHASE + 1);
      }),
    );
  }

  return current;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function fileArtifactIO(): RunnerIO {
  return {
    writeArtifact(name, body) {
      const dir = mustardDir();
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), body, 'utf8');
    },
  };
}

function phase2State(session: MustardSession): PhaseState {
  const ps = session.phases.find((p) => p.id === PHASE);
  if (ps === undefined) {
    throw new Error(`No PhaseState for phase ${PHASE} — runPhase2B should have created it.`);
  }
  return ps;
}

/** Read and validate the working Phase2Output. Only valid after the SEED step. */
function readOutput(ps: PhaseState): Phase2Output {
  if (ps.synthesisedObject === undefined) {
    throw new Error('Phase 2 output missing — part A must run before part B.');
  }
  return Phase2Output.parse(ps.synthesisedObject);
}

function resolveActor(
  output: Phase2Output,
  actorId: string,
): { name: string; description: string } {
  const actor = output.extraction.actors.find((a) => a.id === actorId);
  return actor
    ? { name: actor.name, description: actor.description }
    : { name: actorId, description: '' };
}

function readApproach(ps: PhaseState): string {
  const value = ps.answers.find((a) => a.questionId === UI_APPROACH)?.value;
  return typeof value === 'string' ? value : '';
}

function renderProposedOrder(orderIds: readonly string[], useCases: readonly UseCase[]): string {
  const byId = new Map(useCases.map((u) => [u.id, u.title]));
  return orderIds.map((id, i) => `${i + 1}. ${byId.get(id) ?? id}`).join('\n');
}

function isAnswered(ps: PhaseState, questionId: string): boolean {
  return ps.answers.some((a) => a.questionId === questionId);
}

function answer(
  questionId: string,
  type: Answer['type'],
  value: Answer['value'],
  source: Answer['source'],
  askedAt: string,
): Answer {
  return { questionId, type, value, source, askedAt };
}

/** Split a free-text addition on commas or newlines into trimmed, non-empty items. */
function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Clone the session, ensure phase 2 exists, run `mutate`, return the new session. */
function withPhase2(
  session: MustardSession,
  mutate: (next: MustardSession, ps: PhaseState) => void,
): MustardSession {
  const next = structuredClone(session);
  let ps = next.phases.find((p) => p.id === PHASE);
  if (ps === undefined) {
    ps = {
      id: PHASE,
      status: 'pending',
      answers: [],
      followUpsAsked: 0,
      analysisRuns: 0,
      artifactPaths: [],
      edited: false,
    };
    next.phases.push(ps);
  }
  mutate(next, ps);
  return next;
}
