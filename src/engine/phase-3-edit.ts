import type { DomainExtraction } from '../schemas/extraction.js';
import type { Phase3Output, Retention, SchemaRelationship } from '../schemas/schema-model.js';

/**
 * Pure, immutable helpers for the Phase 3 flow (spec §8.6), factored out of the
 * orchestrator so they are unit-testable without a prompter or an LLM (technical-plan
 * §5, M10 acceptance: "derivation logic unit-tested without any LLM"). Each returns a
 * fresh `Phase3Output` via `structuredClone`; entity ids are carried through
 * unchanged from Phase 2, so nothing is renumbered.
 *
 * Phase 3 is *translation mode*: most of the model is derived here deterministically
 * from the entities. Only two gaps need a question — the cardinality of relationships
 * the extraction marked `ambiguous`, and the values of `isEnum` attributes — plus one
 * global retention decision.
 */

export type Cardinality = SchemaRelationship['cardinality'];

/**
 * Seed the working model from the confirmed extraction: one model per entity,
 * attributes copied with empty `enumValues`, relationships copied verbatim
 * (ambiguous ones await disambiguation). Retention starts `undecided`.
 */
export function seedModel(extraction: DomainExtraction): Phase3Output {
  return {
    models: extraction.entities.map((e) => ({
      entityId: e.id,
      name: e.name,
      description: e.description,
      attributes: e.attributes.map((a) => ({
        name: a.name,
        type: a.type,
        required: a.required,
        isEnum: a.isEnum,
        enumValues: [],
      })),
      relationships: e.relationships.map((r) => ({
        toEntityId: r.toEntityId,
        cardinality: r.cardinality,
        confidence: r.confidence,
      })),
    })),
    retention: 'undecided',
  };
}

/** A pointer to one ambiguous relationship — stable across resume via `(fromEntityId, index)`. */
export interface AmbiguousRef {
  fromEntityId: string;
  /** Index within that model's `relationships` array. */
  index: number;
  toEntityId: string;
}

/** Every relationship still flagged `ambiguous`, in model-then-relationship order. */
export function ambiguousRelationships(output: Phase3Output): AmbiguousRef[] {
  const refs: AmbiguousRef[] = [];
  for (const model of output.models) {
    model.relationships.forEach((rel, index) => {
      if (rel.confidence === 'ambiguous') {
        refs.push({ fromEntityId: model.entityId, index, toEntityId: rel.toEntityId });
      }
    });
  }
  return refs;
}

/** A pointer to one enum attribute — stable across resume via `(entityId, attrName)`. */
export interface EnumRef {
  entityId: string;
  attrName: string;
}

/** Every attribute flagged `isEnum`, in model-then-attribute order. */
export function enumAttributes(output: Phase3Output): EnumRef[] {
  const refs: EnumRef[] = [];
  for (const model of output.models) {
    for (const attr of model.attributes) {
      if (attr.isEnum) {
        refs.push({ entityId: model.entityId, attrName: attr.name });
      }
    }
  }
  return refs;
}

/** Resolve an entity id to its model name; fall back to the id (used to phrase questions). */
export function entityName(output: Phase3Output, entityId: string): string {
  return output.models.find((m) => m.entityId === entityId)?.name ?? entityId;
}

/**
 * The plain-language cardinality confirm (§8.6: "Can one order contain items from more
 * than one seller?"). A pure string template over the two entity names — structural,
 * not phase content, so it lives here and not in the bank (the M2 tripwire holds).
 * Answering `yes` maps to `one_to_many`, `no` to `one_to_one`.
 */
export function cardinalityQuestion(fromName: string, toName: string): string {
  return `Can one ${fromName} be linked to more than one ${toName}?`;
}

/** Set one relationship's cardinality and mark it resolved (`confidence: 'high'`). */
export function setCardinality(
  output: Phase3Output,
  fromEntityId: string,
  index: number,
  cardinality: Cardinality,
): Phase3Output {
  const next = structuredClone(output);
  const model = next.models.find((m) => m.entityId === fromEntityId);
  const rel = model?.relationships[index];
  if (rel) {
    rel.cardinality = cardinality;
    rel.confidence = 'high';
  }
  return next;
}

/** Record the captured allowed values for one enum attribute. */
export function setEnumValues(
  output: Phase3Output,
  entityId: string,
  attrName: string,
  values: readonly string[],
): Phase3Output {
  const next = structuredClone(output);
  const model = next.models.find((m) => m.entityId === entityId);
  const attr = model?.attributes.find((a) => a.name === attrName);
  if (attr) {
    attr.enumValues = dedupe(values);
  }
  return next;
}

/** Record the global retention policy. */
export function setRetention(output: Phase3Output, retention: Retention): Phase3Output {
  const next = structuredClone(output);
  next.retention = retention;
  return next;
}

/** De-duplicate case-insensitively, preserving first occurrence and its casing. */
function dedupe(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
