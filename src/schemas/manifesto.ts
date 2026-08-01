import { z } from 'zod';

/**
 * The Phase 1 SYNTHESISE output contract (spec §8.4). Unlike the frozen §9.3
 * schemas, this is an M6-introduced LLM-output contract — but once fixtures are
 * recorded against it, its shape is frozen too (the fixture key embeds this
 * schema's hash, so any change forces a re-record).
 *
 * `values` are the human-directed manifesto rules that render to `01-MANIFESTO.md`;
 * `aiLaws` are the imperative machine-directed rules that render to `01-AI-LAWS.md`.
 * The book's 8–10 manifesto-rule cap is enforced as `.max(10)` here: an over-long
 * reply fails schema validation, which triggers the LLM client's existing one-shot
 * corrective retry for free (technical-plan pitfall §7.9 — caps as code, not prompt
 * trust). The AI-LAWS ≤200-line cap is a rendered-output property and is enforced
 * in the renderer instead.
 */

export const ManifestoValue = z.object({
  /** Short imperative or noun-phrase title, e.g. "Ship before perfect". */
  title: z.string().min(1),
  /** One or two sentences on what the rule means in practice. */
  rationale: z.string().min(1),
});
export type ManifestoValue = z.infer<typeof ManifestoValue>;

export const ManifestoArtifact = z.object({
  /** Echoes the project name the user gave, for the artifact heading. */
  projectName: z.string().min(1),
  /** The mission — why this needs to exist — as one plain-language paragraph. */
  mission: z.string().min(1),
  /** Human-directed values/team rules. Capped at 10 (the book's 8–10 rule cap). */
  values: z.array(ManifestoValue).min(1).max(10),
  /** Machine-directed rules: imperative, short sentences, one per line in the file. */
  aiLaws: z.array(z.string().min(1)).min(1),
});
export type ManifestoArtifact = z.infer<typeof ManifestoArtifact>;
