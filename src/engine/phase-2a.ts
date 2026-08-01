import type { ExtractFn } from '../llm/passes/extract.js';
import type {
  SuggestCapabilitiesFn,
  SuggestedCapability,
} from '../llm/passes/suggest-capabilities.js';
import { phase2 } from '../questions/bank/phase-2.js';
import { resolvePrompt } from '../questions/index.js';
import { DomainExtraction } from '../schemas/extraction.js';
import type { Answer, MustardSession, PhaseState } from '../schemas/session.js';
import type { Prompter } from '../ui/prompter.js';
import { type IncomingFact, mergeFacts } from './facts.js';
import {
  addActor,
  addEntity,
  clearCapabilities,
  mergeCapabilities,
  removeActor,
  removeEntity,
  renderReflection,
} from './phase-2a-edit.js';
import { saveSession } from './session.js';

/**
 * Phase 2, part A (spec §8.5 steps 1–4; technical-plan §5, M8): capture → extract →
 * reflection → per-actor capability loop. This is a BESPOKE orchestrator, not the
 * generic `runPhase` state machine, because Phase 2 uses a different LLM pass
 * (EXTRACT, not ANALYSE), replaces the follow-up loop with a reflection/capability
 * UI, and writes NO artifact in part A — it ends with a confirmed `DomainExtraction`
 * in `PhaseState.synthesisedObject` that M9 (part B) consumes.
 *
 * Every question STRING still comes from the bank (`phase-2.ts`) or a versioned
 * prompt; only the flow lives here (the M2 tripwire holds — the generic engine stays
 * phase-agnostic).
 *
 * Idempotent, answer-level resume (pitfall §7.5): position is re-derived from the
 * persisted `PhaseState`, never an internal cursor. On re-entry:
 *   - `p2.capture` unanswered              → ask it (SEED)
 *   - answered, `synthesisedObject` absent → run EXTRACT
 *   - object present, no `p2.reflection`   → run REFLECTION (from the raw extraction)
 *   - `p2.reflection` present              → run the CAPABILITY LOOP, skipping actors
 *                                            whose `p2.caps.<id>` marker exists
 * So a Ctrl-C loses nothing and never re-calls the LLM for work already done. The
 * phase is left `in_progress` — M9's WRITE step is what marks it `accepted`.
 */

export interface RunPhase2ADeps {
  prompter: Prompter;
  extract: ExtractFn;
  suggestCapabilities: SuggestCapabilitiesFn;
  /** ISO clock for `askedAt`. Injectable for deterministic tests. */
  now?: () => string;
  /** Persist step. Defaults to `saveSession` (atomic write + `.bak`). */
  save?: (session: MustardSession) => MustardSession;
}

const PHASE = 2;
const CAPTURE_ID = 'p2.capture';
const REFLECTION_DONE = 'p2.reflection';
const capsMarker = (actorId: string): string => `p2.caps.${actorId}`;

const EMPTY_EXTRACTION: DomainExtraction = { actors: [], entities: [], capabilities: [] };

export async function runPhase2A(
  session: MustardSession,
  deps: RunPhase2ADeps,
): Promise<MustardSession> {
  const now = deps.now ?? (() => new Date().toISOString());
  const save = deps.save ?? ((s: MustardSession) => saveSession(s));
  const { prompter } = deps;

  // Ensure the PhaseState exists and is marked in_progress before any question.
  let current = save(
    withPhase2(session, (_next, ps) => {
      if (ps.status === 'pending') {
        ps.status = 'in_progress';
      }
    }),
  );

  // 1. SEED — the single raw-capture editor question.
  if (!isAnswered(phase2State(current), CAPTURE_ID)) {
    const q = phase2.seed[0];
    if (q === undefined) {
      throw new Error('phase-2 bank is missing its capture question.');
    }
    const value = await prompter.editor({
      message: resolvePrompt(q, current.literacy),
      ...(q.help !== undefined ? { help: q.help } : {}),
      ...(minWordsValidate(q.validation?.minWords) ?? {}),
    });
    current = save(
      withPhase2(current, (_next, ps) => {
        ps.answers.push(answer(CAPTURE_ID, 'editor', value, 'seed', now()));
      }),
    );
  }

  // 2. EXTRACT — the fast-model domain reading; persisted raw before reflection.
  if (phase2State(current).synthesisedObject === undefined) {
    const outcome = await deps.extract(current);
    const extraction = outcome.status === 'ok' ? outcome.value : EMPTY_EXTRACTION;
    if (outcome.status !== 'ok') {
      prompter.note(
        "I couldn't read a domain model from that automatically — we'll build it together on the next steps.",
        'Heads up',
      );
    }
    current = save(
      withPhase2(current, (_next, ps) => {
        ps.synthesisedObject = extraction;
      }),
    );
  }

  // 3. REFLECTION — "here's what I heard, correct me" (§8.5 step 3). Atomic: all
  // corrections are applied to a working copy and persisted ONCE with the done
  // marker, so a mid-reflection Ctrl-C restarts reflection cleanly from the raw
  // extraction rather than replaying half-applied edits.
  if (!isAnswered(phase2State(current), REFLECTION_DONE)) {
    let ex = readExtraction(phase2State(current));

    prompter.note(renderReflection(ex), 'Reflection');

    if (ex.actors.length > 0) {
      const remove = await prompter.multiselect({
        message: 'Did I get any of these people wrong? Select any to remove.',
        options: ex.actors.map((a) => ({ value: a.id, label: a.name })),
      });
      for (const id of remove) {
        ex = removeActor(ex, id);
      }
    }
    const addedActors = splitList(
      await prompter.text({
        message: 'Anyone I missed? List people separated by commas, or leave blank.',
      }),
    );
    for (const name of addedActors) {
      ex = addActor(ex, name);
    }

    if (ex.entities.length > 0) {
      const remove = await prompter.multiselect({
        message: 'Did I get any of these things wrong? Select any to remove.',
        options: ex.entities.map((e) => ({ value: e.id, label: e.name })),
      });
      for (const id of remove) {
        ex = removeEntity(ex, id);
      }
    }
    const addedEntities = splitList(
      await prompter.text({
        message: 'Anything it keeps track of that I missed? Separate with commas, or leave blank.',
      }),
    );
    for (const name of addedEntities) {
      ex = addEntity(ex, name);
    }

    // The capability set is rebuilt per actor next, so drop the extract pass's
    // provisional capabilities before the loop begins.
    ex = clearCapabilities(ex);

    const confirmed = ex;
    current = save(
      withPhase2(current, (next, ps) => {
        ps.synthesisedObject = confirmed;
        ps.answers.push(answer(REFLECTION_DONE, 'confirm', true, 'followup', now()));
        // Derived: the confirmed actor count feeds later phases' `when` predicates
        // (e.g. phase-4's concurrency question reads `actorCount`).
        const incoming: IncomingFact[] = [
          { key: 'actorCount', value: confirmed.actors.length, source: 'derived' },
        ];
        next.facts = mergeFacts(next.facts, incoming) as MustardSession['facts'];
      }),
    );
  }

  // 4. CAPABILITY LOOP — per confirmed actor (§8.5 step 4). Persisted per actor so a
  // mid-loop Ctrl-C keeps finished actors and resumes at the next one.
  const actors = readExtraction(phase2State(current)).actors;
  for (const actor of actors) {
    const marker = capsMarker(actor.id);
    if (isAnswered(phase2State(current), marker)) {
      continue;
    }

    const outcome = await deps.suggestCapabilities(current, actor);
    const suggestions = outcome.status === 'ok' ? outcome.value : [];

    let selected: SuggestedCapability[] = [];
    if (suggestions.length > 0) {
      const picked = await prompter.multiselect({
        message: `What can ${actor.name} do? Select all that apply.`,
        options: suggestions.map((s, i) => ({
          value: String(i),
          label: `${s.verb} ${s.object}`.trim(),
        })),
      });
      selected = picked
        .map((v) => suggestions[Number(v)])
        .filter((s): s is SuggestedCapability => s !== undefined);
    }

    const custom = splitList(
      await prompter.text({
        message: `Anything else ${actor.name} can do? Separate with commas, or leave blank.`,
      }),
    );

    const merged = mergeCapabilities(
      readExtraction(phase2State(current)),
      actor.id,
      selected,
      custom,
    );
    current = save(
      withPhase2(current, (_next, ps) => {
        ps.synthesisedObject = merged;
        ps.answers.push(answer(marker, 'confirm', true, 'followup', now()));
      }),
    );
  }

  return current;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function phase2State(session: MustardSession): PhaseState {
  const ps = session.phases.find((p) => p.id === PHASE);
  if (ps === undefined) {
    throw new Error(`No PhaseState for phase ${PHASE} — runPhase2A should have created it.`);
  }
  return ps;
}

/** Read and validate the persisted extraction. Throws if absent — EXTRACT runs first. */
function readExtraction(ps: PhaseState): DomainExtraction {
  if (ps.synthesisedObject === undefined) {
    throw new Error('Phase 2 extraction missing — EXTRACT must run before reflection.');
  }
  return DomainExtraction.parse(ps.synthesisedObject);
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

/** A clack-style validator from a bank question's `minWords`, wrapped for the spec's `validate`. */
function minWordsValidate(
  min: number | undefined,
): { validate: (v: string) => string | undefined } | undefined {
  if (min === undefined) {
    return undefined;
  }
  return {
    validate: (value: string) => {
      const words = value.trim().split(/\s+/).filter(Boolean).length;
      return words >= min ? undefined : `Please write at least ${min} words (you wrote ${words}).`;
    },
  };
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
