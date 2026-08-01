import type { SuggestedCapability } from '../llm/passes/suggest-capabilities.js';
import type { DomainExtraction } from '../schemas/extraction.js';

/**
 * Pure, ID-stable corrections for the Phase 2 reflection and capability steps
 * (spec §8.5 steps 3–4), factored out of the orchestrator so they are unit-testable
 * without a prompter or an LLM.
 *
 * THE INVARIANT (technical-plan §5, M8 risk): the ids the EXTRACT pass minted are
 * the ids Phase 3 will reference. So every function here keeps surviving ids
 * byte-identical, and only ever MINTS a new id for a genuine addition. Ids are never
 * renumbered: `nextId` advances past the highest suffix currently present, so a gap
 * left by removing a non-terminal id is never reused. (Removing the current-highest
 * id and re-adding may reuse that one suffix — harmless in part A, since `removeActor`
 * / `removeEntity` cascade away every reference, so no dangling id can result.)
 *
 * Every function is immutable: it clones and returns a fresh `DomainExtraction`.
 */

type Actor = DomainExtraction['actors'][number];
type Entity = DomainExtraction['entities'][number];
type Capability = DomainExtraction['capabilities'][number];

/**
 * The next free id for a kind, e.g. `nextId('a', ['a1','a3'])` → `'a4'`. Advances
 * past the highest numeric suffix among `existing` (ignoring ids that don't match
 * the prefix), so removed ids leave gaps that are never reused within a session.
 */
export function nextId(prefix: string, existing: readonly string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of existing) {
    const m = re.exec(id);
    if (m) {
      const n = Number(m[1]);
      if (n > max) {
        max = n;
      }
    }
  }
  return `${prefix}${max + 1}`;
}

/** Remove an actor and cascade-remove the capabilities that belonged to it. */
export function removeActor(ex: DomainExtraction, actorId: string): DomainExtraction {
  return {
    actors: ex.actors.filter((a) => a.id !== actorId),
    entities: structuredClone(ex.entities),
    capabilities: ex.capabilities.filter((c) => c.actorId !== actorId),
  };
}

/** Add a new actor with a freshly minted, non-colliding id. Never primary. */
export function addActor(ex: DomainExtraction, name: string, description = ''): DomainExtraction {
  const id = nextId(
    'a',
    ex.actors.map((a) => a.id),
  );
  const actor: Actor = { id, name, description, isPrimary: false };
  return {
    actors: [...structuredClone(ex.actors), actor],
    entities: structuredClone(ex.entities),
    capabilities: structuredClone(ex.capabilities),
  };
}

/**
 * Remove an entity and prune every relationship that pointed at it, so the domain
 * stays referentially valid for Phase 3 (no dangling `toEntityId`).
 */
export function removeEntity(ex: DomainExtraction, entityId: string): DomainExtraction {
  const entities = ex.entities
    .filter((e) => e.id !== entityId)
    .map((e) => ({
      ...structuredClone(e),
      relationships: e.relationships.filter((r) => r.toEntityId !== entityId),
    }));
  return {
    actors: structuredClone(ex.actors),
    entities,
    capabilities: structuredClone(ex.capabilities),
  };
}

/** Add a new entity with a freshly minted id, no attributes and no relationships. */
export function addEntity(ex: DomainExtraction, name: string, description = ''): DomainExtraction {
  const id = nextId(
    'e',
    ex.entities.map((e) => e.id),
  );
  const entity: Entity = { id, name, description, attributes: [], relationships: [] };
  return {
    actors: structuredClone(ex.actors),
    entities: [...structuredClone(ex.entities), entity],
    capabilities: structuredClone(ex.capabilities),
  };
}

/** Drop every capability — used at reflection close, before the per-actor loop rebuilds them. */
export function clearCapabilities(ex: DomainExtraction): DomainExtraction {
  return {
    actors: structuredClone(ex.actors),
    entities: structuredClone(ex.entities),
    capabilities: [],
  };
}

/**
 * Append the accepted suggestions and any custom free-text capabilities for one
 * actor, each with a freshly minted `c…` id bound to `actorId`. A custom line has
 * no structured verb/object, so the whole line becomes both the verb and the
 * description with an empty object — enough for M9's renderer to show it.
 */
export function mergeCapabilities(
  ex: DomainExtraction,
  actorId: string,
  selected: readonly SuggestedCapability[],
  custom: readonly string[],
): DomainExtraction {
  const capabilities: Capability[] = structuredClone(ex.capabilities);
  const mint = (): string => {
    const id = nextId(
      'c',
      capabilities.map((c) => c.id),
    );
    return id;
  };

  for (const s of selected) {
    capabilities.push({
      id: mint(),
      actorId,
      verb: s.verb,
      object: s.object,
      description: s.description,
    });
  }
  for (const line of custom) {
    const text = line.trim();
    if (text.length === 0) {
      continue;
    }
    capabilities.push({ id: mint(), actorId, verb: text, object: '', description: text });
  }

  return {
    actors: structuredClone(ex.actors),
    entities: structuredClone(ex.entities),
    capabilities,
  };
}

/**
 * The "here's what I heard, correct me" display (spec §8.5 step 3). Pure and
 * deterministic so it can be snapshotted and shown via `prompter.note`. Lists the
 * confirmed actors and entities — capabilities are handled in the next step.
 */
export function renderReflection(ex: DomainExtraction): string {
  const lines: string[] = ["Here's what I heard. Correct me on the next few questions.", ''];

  lines.push('Actors:');
  if (ex.actors.length === 0) {
    lines.push('  (none yet)');
  } else {
    for (const a of ex.actors) {
      const primary = a.isPrimary ? ' (primary)' : '';
      lines.push(`  - ${a.name}${primary} — ${a.description}`);
    }
  }
  lines.push('');

  lines.push('Things it keeps track of:');
  if (ex.entities.length === 0) {
    lines.push('  (none yet)');
  } else {
    for (const e of ex.entities) {
      lines.push(`  - ${e.name} — ${e.description}`);
    }
  }

  return lines.join('\n');
}
