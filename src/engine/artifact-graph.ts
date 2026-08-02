import type { MustardSession } from '../schemas/session.js';
import { withPhase } from './orchestrator.js';

/**
 * The phase → artifact map as DATA (spec §9.2/§9.7, technical-plan §5 M14 risk,
 * pitfall 8). It mirrors each bank module's `synthesis.artifacts` list so there is
 * one source of truth for "which phase owns which file". Modelled as data — not
 * branching code — precisely so v0.3 `mustard drift` (spec §11) can import the same
 * graph without touching the interrogation engine.
 *
 * NOTE the deliberate off-by-number: `03-STRUCTURE.md` is a **Phase 4** artifact
 * despite its Phase 3 filename (spec §8.6/§8.7, pitfall §7.1) — a folder tree cannot
 * precede the stack it must match.
 */
export const PHASE_ARTIFACTS: Record<number, readonly string[]> = {
  0: [],
  1: ['01-MANIFESTO.md', '01-AI-LAWS.md'],
  2: ['02-USE-CASES.md'],
  3: ['03-SCHEMAS.md'],
  4: ['04-STACK.md', '03-STRUCTURE.md'],
  5: ['05-ARCHITECTURE.md', '05-DECISIONS.md'],
  6: ['06-ROADMAP.md'],
  7: ['07-PROMPTS/', '00-BRIEFING.md'],
};

/** The last phase in the mission — the mission spans phases 0..7 inclusive. */
export const LAST_PHASE = 7;

/**
 * The phases whose artifacts become stale when phase `n` is re-run: every later
 * phase (n+1 .. 7). Re-running phase `n` regenerates its OWN artifacts, so they are
 * not "downstream".
 */
export function downstreamPhases(n: number): number[] {
  const out: number[] = [];
  for (let id = n + 1; id <= LAST_PHASE; id++) {
    if (id in PHASE_ARTIFACTS) {
      out.push(id);
    }
  }
  return out;
}

/**
 * The flat list of artifacts that become stale when phase `n` is re-run — the union
 * of every downstream phase's artifacts. Drives the `phase --redo` staleness warning
 * (spec §9.6): e.g. re-running Phase 3 makes 04-STACK, 03-STRUCTURE, 05-ARCHITECTURE,
 * 05-DECISIONS, 06-ROADMAP, 07-PROMPTS/ and 00-BRIEFING stale.
 */
export function downstreamArtifacts(n: number): string[] {
  return downstreamPhases(n).flatMap((id) => [...(PHASE_ARTIFACTS[id] ?? [])]);
}

/**
 * Reset a phase to its pre-run state so the mission driver re-runs it (spec §9.6
 * `phase <n> --redo`). Pure over the session (clones via `withPhase`): clears the
 * answers, analysis, the retained `synthesisedObject`, any in-flight review state,
 * the artifact paths, the accepted/edited flags and the acceptance timestamp.
 *
 * Clearing the answers also clears bespoke resume markers (e.g. Phase 2's
 * `p2b.seeded`), so a reset Phase 2 restarts from part A (drive.ts `phase2bStarted`).
 */
export function resetPhase(session: MustardSession, id: number): MustardSession {
  return withPhase(session, id, (_next, ps) => {
    ps.status = 'pending';
    ps.answers = [];
    ps.analysis = undefined;
    ps.followUpsAsked = 0;
    ps.analysisRuns = 0;
    ps.artifactPaths = [];
    ps.acceptedAt = undefined;
    ps.edited = false;
    ps.synthesisedObject = undefined;
    ps.pendingSynthesis = undefined;
  });
}
