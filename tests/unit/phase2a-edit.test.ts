import { describe, expect, it } from 'vitest';
import {
  addActor,
  addEntity,
  clearCapabilities,
  mergeCapabilities,
  nextId,
  removeActor,
  removeEntity,
  renderReflection,
} from '../../src/engine/phase-2a-edit.js';
import type { DomainExtraction } from '../../src/schemas/extraction.js';
import { makeDomainExtraction } from './fixtures.js';

/**
 * Pure ID-stable correction helpers for Phase 2 reflection/capabilities (M8). No
 * prompter, no LLM — the property under test is that surviving ids never move and
 * additions never collide, because Phase 3 will reference these ids.
 */

const EMPTY: DomainExtraction = { actors: [], entities: [], capabilities: [] };

describe('nextId', () => {
  it('advances past the highest matching suffix', () => {
    expect(nextId('a', ['a1', 'a3'])).toBe('a4');
    expect(nextId('e', ['e2'])).toBe('e3');
  });

  it('mints the first id from an empty list', () => {
    expect(nextId('c', [])).toBe('c1');
  });

  it('ignores ids that do not match the prefix', () => {
    expect(nextId('a', ['e1', 'e9', 'c3'])).toBe('a1');
  });
});

describe('removeActor', () => {
  it('removes the actor and cascade-removes its capabilities', () => {
    const ex = makeDomainExtraction(); // a1 owns capability c1
    const next = removeActor(ex, 'a1');
    expect(next.actors.map((a) => a.id)).not.toContain('a1');
    expect(next.capabilities.some((c) => c.actorId === 'a1')).toBe(false);
  });

  it('is a no-op for an unknown id and leaves entities untouched', () => {
    const ex = makeDomainExtraction();
    const next = removeActor(ex, 'nope');
    expect(next.actors).toEqual(ex.actors);
    expect(next.entities).toEqual(ex.entities);
  });
});

describe('addActor', () => {
  it('mints a non-colliding id and is never primary', () => {
    const ex = makeDomainExtraction(); // a1 exists
    const next = addActor(ex, 'Coach', 'Reviews progress');
    const added = next.actors.find((a) => a.name === 'Coach');
    expect(added?.id).toBe('a2');
    expect(added?.isPrimary).toBe(false);
  });

  it('mints a1 into an empty extraction', () => {
    expect(addActor(EMPTY, 'Owner').actors[0]?.id).toBe('a1');
  });
});

describe('removeEntity', () => {
  it('removes the entity and prunes relationships pointing at it', () => {
    const ex = makeDomainExtraction(); // e1→e3 (ambiguous) and e2→e3 point at Tag
    const next = removeEntity(ex, 'e3');
    expect(next.entities.map((e) => e.id)).toEqual(['e1', 'e2']);
    const dangling = next.entities
      .flatMap((e) => e.relationships)
      .some((r) => r.toEntityId === 'e3');
    expect(dangling).toBe(false);
    // The unrelated e1→e2 relationship survives.
    expect(next.entities.find((e) => e.id === 'e1')?.relationships).toEqual([
      { toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' },
    ]);
  });
});

describe('addEntity', () => {
  it('mints a fresh id past the highest present', () => {
    const ex = makeDomainExtraction(); // e1,e2,e3
    expect(addEntity(ex, 'Streak').entities.at(-1)?.id).toBe('e4');
  });

  it('does not reuse the id of a removed non-terminal entity', () => {
    const ex = makeDomainExtraction();
    const removed = removeEntity(ex, 'e1'); // gap at e1, e2/e3 remain
    const added = addEntity(removed, 'Streak');
    expect(added.entities.map((e) => e.id)).not.toContain('e1');
    expect(added.entities.at(-1)?.id).toBe('e4');
  });
});

describe('ID stability under a combined correction', () => {
  it('keeps every surviving id byte-identical when removing an actor and adding an entity', () => {
    const ex = makeDomainExtraction();
    const survivingEntityIds = ex.entities.map((e) => e.id);

    let next = removeActor(ex, 'a1');
    next = addEntity(next, 'Streak', 'A run of completed days');

    // Original entity ids are untouched; only a new one is appended.
    expect(next.entities.slice(0, survivingEntityIds.length).map((e) => e.id)).toEqual(
      survivingEntityIds,
    );
    expect(next.entities.at(-1)?.id).toBe('e4');
  });
});

describe('mergeCapabilities', () => {
  it('appends selected suggestions and custom lines with minted ids bound to the actor', () => {
    const base = clearCapabilities(makeDomainExtraction()); // capabilities: []
    const next = mergeCapabilities(
      base,
      'a1',
      [{ verb: 'create', object: 'habit', description: 'start tracking a habit' }],
      ['export data', '  '], // blank line is dropped
    );
    expect(next.capabilities.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(next.capabilities.every((c) => c.actorId === 'a1')).toBe(true);
    // Custom free text becomes verb + description with an empty object.
    expect(next.capabilities[1]).toMatchObject({
      verb: 'export data',
      object: '',
      description: 'export data',
    });
  });

  it('mints ids past any capabilities already present for earlier actors', () => {
    const base = clearCapabilities(makeDomainExtraction());
    const first = mergeCapabilities(base, 'a1', [{ verb: 'a', object: 'b', description: 'c' }], []);
    const second = mergeCapabilities(first, 'a2', [], ['do thing']);
    expect(second.capabilities.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(second.capabilities[1]?.actorId).toBe('a2');
  });
});

describe('renderReflection', () => {
  it('renders a stable, human-readable summary of actors and entities', () => {
    expect(renderReflection(makeDomainExtraction())).toMatchSnapshot();
  });

  it('handles an empty extraction without crashing', () => {
    const out = renderReflection(EMPTY);
    expect(out).toContain('(none yet)');
  });
});
