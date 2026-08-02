import { type AdapterContext, adapterPathFor, writeAdapter } from '../render/adapters/index.js';
import { type AdapterIO, fileAdapterIO } from '../render/adapters/io.js';
import { type BriefingContext, renderBriefing } from '../render/markdown/briefing.js';
import { type FrontmatterMeta, deriveSessionId } from '../render/markdown/frontmatter.js';
import {
  type PromptCardContext,
  promptCardFilename,
  renderPromptCard,
} from '../render/markdown/prompt-card.js';
import { ManifestoArtifact } from '../schemas/manifesto.js';
import { Phase2Output } from '../schemas/phase2-output.js';
import type { MustardSession, PhaseState } from '../schemas/session.js';
import { Phase4Output } from '../schemas/stack.js';
import type { Task } from '../schemas/task.js';
import type { Prompter } from '../ui/prompter.js';
import { readVersion } from '../version.js';
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
 * Phase 7 — Development & Documentation (spec §8.10, technical-plan §5, M13). No
 * questions: pure generation from the already-accepted bundle. It renders a prompt
 * card per roadmap task into `07-PROMPTS/`, writes the agent adapter file at the
 * repo root (sentinel-merged, idempotent — §9.7), and finally `00-BRIEFING.md`,
 * written LAST so it can summarise everything (pitfall §7.7).
 *
 * Review is BUNDLE-LEVEL (a single confirm before writing), not per-artifact: the
 * cards, adapter and briefing are pure renders of artifacts the user already
 * accepted, and a full session can produce 10–20 cards. Declining writes nothing
 * and leaves the phase resumable.
 *
 * Idempotent, answer-level resume (pitfall §7.5): the `p7.write` marker guards the
 * whole write. Re-running before it is set reproduces byte-identical output (the
 * adapter via the sentinel merge). Closes with the first `mustard prompts` command.
 */

export interface RunPhase7Deps {
  prompter: Prompter;
  /** Where the `mustard/` artifacts (prompt cards, briefing) are written. */
  io?: RunnerIO;
  /** Where the repo-root adapter file is read/written. Defaults to the cwd root. */
  adapterIo?: AdapterIO;
  /** Package version for artifact frontmatter. Defaults to the runtime version. */
  mustardVersion?: string;
  /** ISO clock. Injectable for tests. */
  now?: () => string;
  /** Persist step. Defaults to `saveSession`. */
  save?: (session: MustardSession) => MustardSession;
}

const PHASE = 7;
const WRITE_DONE = 'p7.write';
const BRIEFING = '00-BRIEFING.md';

/** The `mustard/` files a prompt card points the agent at (§8.10). */
const CONTEXT_FILES: readonly string[] = [
  'mustard/02-USE-CASES.md',
  'mustard/03-SCHEMAS.md',
  'mustard/04-STACK.md',
  'mustard/05-ARCHITECTURE.md',
  'mustard/06-ROADMAP.md',
];

export async function runPhase7(
  session: MustardSession,
  deps: RunPhase7Deps,
): Promise<MustardSession> {
  const now = deps.now ?? (() => new Date().toISOString());
  const save = deps.save ?? ((s: MustardSession) => saveSession(s));
  const io = deps.io ?? fileArtifactIO();
  const adapterIo = deps.adapterIo ?? fileAdapterIO();
  const mustardVersion = deps.mustardVersion ?? readVersion();
  const { prompter } = deps;

  let current = save(
    withPhase(session, PHASE, (_next, ps) => {
      if (ps.status === 'pending') {
        ps.status = 'in_progress';
      }
    }),
  );

  // Already generated on a prior run — nothing to redo.
  if (isAnswered(phaseState(current), WRITE_DONE)) {
    return current;
  }

  // Assemble the generation context from the accepted bundle.
  const manifesto = ManifestoArtifact.parse(phaseStateOf(current, 1).synthesisedObject);
  const phase2 = Phase2Output.parse(phaseStateOf(current, 2).synthesisedObject);
  const phase4 = Phase4Output.parse(phaseStateOf(current, 4).synthesisedObject);
  const tasks = current.tasks;

  const meta: FrontmatterMeta = {
    phase: PHASE,
    sessionId: deriveSessionId(current),
    generatedAt: now(),
    mustardVersion,
  };

  // Render the prompt cards (in memory). Each task's do-not-touch list is the files
  // every OTHER task owns, minus the ones this task itself touches.
  const cards = tasks.map((task) => ({
    name: promptCardFilename(task),
    body: renderPromptCard(task, cardContext(manifesto.aiLaws, task, tasks), meta),
  }));

  const adapterPath = adapterPathFor(current.agentTarget);

  // Briefing is assembled LAST so it can reference everything (pitfall §7.7).
  const briefingCtx: BriefingContext = {
    projectName: manifesto.projectName,
    mission: manifesto.mission,
    useCaseCount: phase2.useCases.length,
    stack: phase4.decisions.map((d) => ({ category: d.category, choice: d.choice })),
    taskCount: tasks.length,
    adapterPath,
  };
  const briefing = renderBriefing(briefingCtx, meta);

  // Bundle-level review: one confirm before anything is written.
  prompter.note(
    [
      `${cards.length} prompt card(s) → mustard/07-PROMPTS/`,
      `Agent guide → ${adapterPath}`,
      `Summary → mustard/${BRIEFING}`,
    ].join('\n'),
    'Ready to write the final bundle',
  );
  const go = await prompter.confirm({
    message: 'Write the prompt pack, the agent guide, and the briefing?',
  });

  if (!go) {
    prompter.note('Nothing written. Run `mustard resume` when you are ready.', 'Paused');
    return current;
  }

  // Write: prompt cards, then the repo-root adapter, then the briefing LAST.
  for (const card of cards) {
    io.writeArtifact(card.name, card.body);
  }
  const adapterCtx: AdapterContext = {
    projectName: manifesto.projectName,
    mission: manifesto.mission,
    aiLaws: manifesto.aiLaws,
  };
  writeAdapter(adapterIo, current.agentTarget, adapterCtx);
  io.writeArtifact(BRIEFING, briefing);

  current = save(
    withPhase(current, PHASE, (next, ps) => {
      ps.status = 'accepted';
      ps.acceptedAt = now();
      ps.artifactPaths = [...cards.map((c) => c.name), BRIEFING];
      ps.answers.push(makeAnswer(WRITE_DONE, 'confirm', true, 'derived', now()));
      next.currentPhase = Math.max(next.currentPhase, PHASE + 1);
    }),
  );

  // Closing screen (§8.10): the first return-loop command.
  prompter.note(
    'Your plan is complete. Run `mustard prompts` to get your first task, paste it into your agent, and build.',
    'Mission accomplished',
  );

  return current;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function phaseState(session: MustardSession): PhaseState {
  return phaseStateOf(session, PHASE);
}

/** The prompt-card context for one task: inlined laws, standard pointers, do-not-touch. */
function cardContext(
  aiLaws: readonly string[],
  task: Task,
  allTasks: readonly Task[],
): PromptCardContext {
  const own = new Set(task.filesTouched);
  const doNotTouch = new Set<string>();
  for (const other of allTasks) {
    if (other.id === task.id) {
      continue;
    }
    for (const file of other.filesTouched) {
      if (!own.has(file)) {
        doNotTouch.add(file);
      }
    }
  }
  return {
    aiLaws,
    contextFiles: CONTEXT_FILES,
    doNotTouch: [...doNotTouch],
  };
}
