import { z } from 'zod';
import type { DomainExtraction } from './extraction.js';

/**
 * The Phase 3 output (spec §8.6, technical-plan §5, M10): the data model *derived*
 * from the confirmed Phase 2 `DomainExtraction`, enriched with the two things the
 * extraction cannot carry — captured enum values and the disambiguated cardinality
 * of the relationships flagged `ambiguous` — plus a single global retention policy.
 *
 * Phase 3 is a bespoke orchestrator (like Phase 2): it seeds this object from the
 * entities, resolves the gaps through a handful of questions, then renders
 * `03-SCHEMAS.md` from it. This schema is additive — it consumes the frozen §9.3
 * `DomainExtraction` unchanged (which stores `isEnum: boolean` but no values, and
 * `confidence: 'ambiguous'` but no user decision) and carries the resolved model
 * forward as its own typed object. It flows into no LLM fixture key (the render is
 * deterministic), so it is not one of the frozen contracts.
 */

/** One attribute of a model. Mirrors the extraction's attribute plus captured enum values. */
export const SchemaAttribute = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  isEnum: z.boolean(),
  /** The allowed values, captured in Phase 3's enum-discovery step. Empty until asked. */
  enumValues: z.array(z.string()).default([]),
});
export type SchemaAttribute = z.infer<typeof SchemaAttribute>;

/** One relationship, carried from the extraction; `confidence` flips to `high` once disambiguated. */
export const SchemaRelationship = z.object({
  toEntityId: z.string(),
  cardinality: z.enum(['one_to_one', 'one_to_many', 'many_to_many']),
  confidence: z.enum(['high', 'ambiguous']),
});
export type SchemaRelationship = z.infer<typeof SchemaRelationship>;

/** One data model, derived one-to-one from a confirmed entity (ids stay stable). */
export const SchemaModel = z.object({
  /** The source entity id — stable from Phase 2, so downstream references hold. */
  entityId: z.string(),
  name: z.string(),
  description: z.string(),
  attributes: z.array(SchemaAttribute),
  relationships: z.array(SchemaRelationship),
});
export type SchemaModel = z.infer<typeof SchemaModel>;

/**
 * The global soft-delete / retention policy (§8.6: "when someone deletes something,
 * should it be recoverable?"). A single decision applied across the model — the
 * user picks one; `undecided` is the seeded state before the question is asked.
 */
export const Retention = z.enum(['recoverable', 'hard_delete', 'archived', 'undecided']);
export type Retention = z.infer<typeof Retention>;

export const Phase3Output = z.object({
  models: z.array(SchemaModel),
  retention: Retention.default('undecided'),
});
export type Phase3Output = z.infer<typeof Phase3Output>;

/**
 * Project the resolved model back into the `DomainExtraction` shape that
 * `renderErDiagram` (render/mermaid/er.ts) consumes — entities only; actors and
 * capabilities are irrelevant to the ER diagram. Pure. Lives here (not in the
 * renderer or the engine) so both can reuse it without a render→engine import.
 * By this point every relationship is `high` confidence, so the diagram draws them all.
 */
export function toErInput(output: Phase3Output): DomainExtraction {
  return {
    actors: [],
    entities: output.models.map((m) => ({
      id: m.entityId,
      name: m.name,
      description: m.description,
      attributes: m.attributes.map((a) => ({
        name: a.name,
        type: a.type,
        required: a.required,
        isEnum: a.isEnum,
      })),
      relationships: m.relationships.map((r) => ({
        toEntityId: r.toEntityId,
        cardinality: r.cardinality,
        confidence: r.confidence,
      })),
    })),
    capabilities: [],
  };
}
