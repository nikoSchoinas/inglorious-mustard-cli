/**
 * Versioned system prompts (technical-plan §2.3, M4). Every LLM pass carries a
 * version-tagged system prompt from this directory — one file per prompt — and
 * that `version` string flows into the fixture cache key (`fixtures.ts`). Bumping
 * a prompt's `version` therefore invalidates its recorded fixtures loudly instead
 * of replaying stale answers against changed instructions.
 *
 * The actual pass prompts (analyse, extract, synthesise, …) are authored in later
 * milestones (M6+). M4 only establishes the shape and the connectivity prompt.
 */
export interface SystemPrompt {
  /** Stable identifier, e.g. `'analyse'` or `'connectivity'`. */
  id: string;
  /** Bump on any wording change — participates in the fixture key. */
  version: string;
  /** The system-message text sent to the model. */
  text: string;
}
