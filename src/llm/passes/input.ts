import type { MustardSession, PhaseState } from '../../schemas/session.js';

/**
 * Shared helpers for building deterministic pass inputs. The input object is
 * hashed for the fixture key (fixtures.ts), so it must be a stable projection of
 * the session — never include timestamps or ordering that could vary between runs
 * with the same answers.
 */

export function phaseStateOf(session: MustardSession, phaseId: number): PhaseState {
  const ps = session.phases.find((p) => p.id === phaseId);
  if (ps === undefined) {
    throw new Error(`No PhaseState for phase ${phaseId} — the runner should have created it.`);
  }
  return ps;
}

export interface AnswerProjection {
  id: string;
  value: string | number | string[] | boolean;
}

/** The phase's answers as an ordered `{id, value}` list — stable across identical runs. */
export function projectAnswers(ps: PhaseState): AnswerProjection[] {
  return ps.answers.map((a) => ({ id: a.questionId, value: a.value }));
}
