import type { MustardSession } from '../../src/schemas/session.js';

/**
 * A complete, scored-once planning bundle for the golden set (M15). A full mission
 * run (`runGoldenMission`) produces one of these: the final `MustardSession` plus the
 * rendered markdown artifacts read back off disk (or captured in memory). Both the
 * deterministic rubric (`rubric.ts`) and the LLM judge (`judge.ts`) score a `GoldenBundle`,
 * so neither has to re-run the mission or re-parse `mustard/`.
 */
export interface GoldenBundle {
  session: MustardSession;
  /** Artifact file name (e.g. `01-AI-LAWS.md`) → its rendered markdown. */
  artifacts: Record<string, string>;
}

/** The typed object a phase left in `PhaseState.synthesisedObject`, or undefined. */
export function phaseObject(session: MustardSession, phaseId: number): unknown {
  return session.phases.find((p) => p.id === phaseId)?.synthesisedObject;
}
