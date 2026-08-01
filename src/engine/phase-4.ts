import type { ExplainStackFn } from '../llm/passes/explain-stack.js';
import type { ProposeStackFn } from '../llm/passes/propose-stack.js';
import type { ProposeStructureFn } from '../llm/passes/propose-structure.js';
import { phase4 } from '../questions/bank/phase-4.js';
import { resolvePrompt } from '../questions/index.js';
import type { Question } from '../questions/types.js';
import { deriveSessionId } from '../render/markdown/frontmatter.js';
import { createRendererRegistry } from '../render/register.js';
import type { RendererRegistry } from '../render/registry.js';
import type { MustardSession, PhaseState } from '../schemas/session.js';
import { Phase4Output, type StackDecision } from '../schemas/stack.js';
import { type EditorLauncher, defaultEditorLauncher } from '../ui/editor.js';
import type { Prompter } from '../ui/prompter.js';
import { reviewProposal } from '../ui/proposal-review.js';
import { readVersion } from '../version.js';
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
 * Phase 4 — Tools & Technologies (spec §8.7, technical-plan §5, M11). "Proposal mode":
 * Phase 4 asks only the business questions in the bank (`phase-4.ts`), then the
 * `propose-stack` deep pass turns the derived `needs.*`/`context.*` facts into a full
 * set of `StackDecision`s. Each is reviewed ONE AT A TIME (§8.7): accept / choose an
 * alternative / explain more / "I already decided, it's X". Finally the accepted stack
 * drives the `propose-structure` pass and both artifacts are written.
 *
 * Like Phase 2/3 this is a BESPOKE orchestrator: the SEED questions are static (the
 * bank), but the per-decision proposal review is not the generic full-artifact review
 * gate, so it does not fit `runPhase`. Question STRINGS still live in the bank (the M2
 * tripwire holds); only the flow lives here.
 *
 * Emits `04-STACK.md` AND the deferred `03-STRUCTURE.md` (pitfall §7.1) — the artifact
 * set comes from `phase4.synthesis.artifacts`, rendered against the ACCEPTED stack.
 *
 * Idempotent, answer-level resume (pitfall §7.5): position is re-derived from marker
 * answers, never an internal cursor:
 *   - each `p4.<seed-id>`       → one business/context question
 *   - `p4.proposed`             → the batch `propose-stack` call; decisions stored
 *   - `p4.decision.<i>` per dec → resolve one proposed decision (locked overrides survive)
 *   - `p4.structure`            → the `propose-structure` call; tree stored
 *   - `p4.write`               → render, review, write both artifacts, accept
 * A Ctrl-C loses nothing and never re-runs a pass whose marker is already set.
 */

export interface RunPhase4Deps {
  prompter: Prompter;
  /** Phase 4 stack-proposal pass (deep). */
  proposeStack: ProposeStackFn;
  /** Phase 4 "explain more" pass (fast). */
  explainStack: ExplainStackFn;
  /** Phase 4 folder-tree pass (fast). */
  proposeStructure: ProposeStructureFn;
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

const PHASE = 4;
const PROPOSED = 'p4.proposed';
const STRUCTURE_DONE = 'p4.structure';
const WRITE_DONE = 'p4.write';
const decisionMarker = (index: number): string => `p4.decision.${index}`;

const REVIEW_CHOICES = [
  { value: 'accept', label: 'Accept — write it and move on' },
  { value: 'edit', label: 'Edit in $EDITOR' },
];

export async function runPhase4(
  session: MustardSession,
  deps: RunPhase4Deps,
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

  // 1. SEED — ask the business + context questions (§4.2, §8.7). Static bank
  // questions; only the flow is here. Persist each answer and map it to facts so
  // `propose-stack` reads the derived `needs.*`/`context.*` store.
  for (const question of phase4.seed) {
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

  // 2. PROPOSE — one deep call turns the facts into the full stack (§8.7). Stored as
  // the working `Phase4Output` (structure filled in later).
  if (!isAnswered(phaseState(current), PROPOSED)) {
    const outcome = await deps.proposeStack(current);
    const decisions = outcome.status === 'ok' ? outcome.value : [];
    current = save(
      withPhase(current, PHASE, (_next, ps) => {
        ps.synthesisedObject = { decisions, structure: [] } satisfies Phase4Output;
        ps.answers.push(makeAnswer(PROPOSED, 'proposal', true, 'derived', now()));
      }),
    );
  }

  // 3. DECISION LOOP — review each proposed decision one at a time (§8.7). `explain
  // more` fetches an elaboration and re-asks the SAME decision; `choose alternative`
  // swaps the choice; `already decided` overrides and LOCKS it (survives any redo).
  const decisionCount = readOutput(phaseState(current)).decisions.length;
  for (let i = 0; i < decisionCount; i++) {
    const marker = decisionMarker(i);
    if (isAnswered(phaseState(current), marker)) {
      continue;
    }

    let resolved: StackDecision | undefined;
    while (resolved === undefined) {
      const decision = readOutput(phaseState(current)).decisions[i];
      if (decision === undefined) {
        throw new Error(`Phase 4 decision ${i} vanished from the stored proposal.`);
      }
      const result = await reviewProposal(prompter, decision);

      if (result.choice === 'explain-more') {
        const outcome = await deps.explainStack(current, decision);
        const text =
          outcome.status === 'ok'
            ? outcome.value.explanation
            : 'No extra detail is available right now.';
        prompter.note(text, `More on ${decision.choice}`);
        continue;
      }

      if (result.choice === 'choose-alternative' && result.alternative !== undefined) {
        resolved = { ...decision, choice: result.alternative };
      } else if (result.choice === 'already-decided') {
        resolved = { ...decision, choice: result.override ?? decision.choice, locked: true };
      } else {
        resolved = decision;
      }
    }

    const decided = resolved;
    current = save(
      withPhase(current, PHASE, (_next, ps) => {
        const out = readOutput(ps);
        out.decisions[i] = decided;
        ps.synthesisedObject = out;
        ps.answers.push(makeAnswer(marker, 'proposal', decided.choice, 'derived', now()));
      }),
    );
  }

  // 4. STRUCTURE — propose the folder tree against the ACCEPTED stack (§8.7, pitfall
  // §7.1: `03-STRUCTURE.md` is a Phase 4 output).
  if (!isAnswered(phaseState(current), STRUCTURE_DONE)) {
    const decisions = readOutput(phaseState(current)).decisions;
    const outcome = await deps.proposeStructure(current, decisions);
    const structure = outcome.status === 'ok' ? outcome.value : [];
    current = save(
      withPhase(current, PHASE, (_next, ps) => {
        const out = readOutput(ps);
        out.structure = structure;
        ps.synthesisedObject = out;
        ps.answers.push(makeAnswer(STRUCTURE_DONE, 'confirm', true, 'derived', now()));
      }),
    );
  }

  // 5. WRITE — render both artifacts against the accepted stack, review each, write,
  // accept the phase, advance the mission.
  if (!isAnswered(phaseState(current), WRITE_DONE)) {
    const artifacts = phase4.synthesis?.artifacts ?? [];
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

/** Phase 4's state (throwing getter), phase-bound for the many call sites. */
function phaseState(session: MustardSession): PhaseState {
  return phaseStateOf(session, PHASE);
}

/** Read and validate the working Phase4Output. Only valid after the PROPOSE step. */
function readOutput(ps: PhaseState): Phase4Output {
  if (ps.synthesisedObject === undefined) {
    throw new Error('Phase 4 output missing — the PROPOSE step must run first.');
  }
  return Phase4Output.parse(ps.synthesisedObject);
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
