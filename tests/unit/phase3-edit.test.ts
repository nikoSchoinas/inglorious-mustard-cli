import { describe, expect, it } from 'vitest';
import {
  ambiguousRelationships,
  cardinalityQuestion,
  entityName,
  enumAttributes,
  seedModel,
  setCardinality,
  setEnumValues,
  setRetention,
} from '../../src/engine/phase-3-edit.js';
import type { DomainExtraction } from '../../src/schemas/extraction.js';
import { Phase3Output, toErInput } from '../../src/schemas/schema-model.js';

/**
 * M10 acceptance (technical-plan §5): the Phase 3 derivation logic is pure and
 * unit-testable with no LLM and no prompter. Covers seeding the model from the
 * extraction, selecting the gaps to ask about, and merging the answers back.
 */

/** A small extraction with one ambiguous relationship and one enum attribute. */
function extraction(): DomainExtraction {
  return {
    actors: [{ id: 'a1', name: 'User', description: '', isPrimary: true }],
    entities: [
      {
        id: 'e1',
        name: 'Order',
        description: 'A purchase',
        attributes: [
          { name: 'total', type: 'number', required: true, isEnum: false },
          { name: 'status', type: 'string', required: true, isEnum: true },
        ],
        relationships: [{ toEntityId: 'e2', cardinality: 'one_to_one', confidence: 'ambiguous' }],
      },
      {
        id: 'e2',
        name: 'Item',
        description: 'A line item',
        attributes: [{ name: 'name', type: 'string', required: true, isEnum: false }],
        relationships: [],
      },
    ],
    capabilities: [],
  };
}

describe('seedModel', () => {
  it('derives one model per entity, copying attributes and relationships faithfully', () => {
    const out = seedModel(extraction());

    expect(out.models.map((m) => m.entityId)).toEqual(['e1', 'e2']);
    expect(out.retention).toBe('undecided');

    const order = out.models[0];
    expect(order?.name).toBe('Order');
    expect(order?.attributes).toEqual([
      { name: 'total', type: 'number', required: true, isEnum: false, enumValues: [] },
      { name: 'status', type: 'string', required: true, isEnum: true, enumValues: [] },
    ]);
    expect(order?.relationships).toEqual([
      { toEntityId: 'e2', cardinality: 'one_to_one', confidence: 'ambiguous' },
    ]);
  });

  it('produces a value that satisfies the Phase3Output schema', () => {
    expect(() => Phase3Output.parse(seedModel(extraction()))).not.toThrow();
  });
});

describe('gap selection', () => {
  it('selects exactly the ambiguous relationships', () => {
    const refs = ambiguousRelationships(seedModel(extraction()));
    expect(refs).toEqual([{ fromEntityId: 'e1', index: 0, toEntityId: 'e2' }]);
  });

  it('selects exactly the enum attributes', () => {
    const refs = enumAttributes(seedModel(extraction()));
    expect(refs).toEqual([{ entityId: 'e1', attrName: 'status' }]);
  });

  it('resolves entity names for question phrasing, falling back to the id', () => {
    const out = seedModel(extraction());
    expect(entityName(out, 'e2')).toBe('Item');
    expect(entityName(out, 'nope')).toBe('nope');
  });

  it('phrases the cardinality confirm over the two names', () => {
    expect(cardinalityQuestion('Order', 'Item')).toBe(
      'Can one Order be linked to more than one Item?',
    );
  });
});

describe('answer merging', () => {
  it('setCardinality resolves the relationship and flips confidence to high', () => {
    const out = setCardinality(seedModel(extraction()), 'e1', 0, 'one_to_many');
    const rel = out.models[0]?.relationships[0];
    expect(rel).toEqual({ toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' });
    // No ambiguous relationships remain.
    expect(ambiguousRelationships(out)).toEqual([]);
  });

  it('setEnumValues records de-duplicated values on the right attribute', () => {
    const out = setEnumValues(seedModel(extraction()), 'e1', 'status', [
      'pending',
      'paid',
      'PENDING',
      ' ',
    ]);
    const attr = out.models[0]?.attributes.find((a) => a.name === 'status');
    expect(attr?.enumValues).toEqual(['pending', 'paid']);
  });

  it('setRetention records the global policy', () => {
    expect(setRetention(seedModel(extraction()), 'recoverable').retention).toBe('recoverable');
  });

  it('helpers never mutate their input', () => {
    const original = seedModel(extraction());
    const snapshot = structuredClone(original);
    setCardinality(original, 'e1', 0, 'many_to_many');
    setEnumValues(original, 'e1', 'status', ['a']);
    setRetention(original, 'hard_delete');
    expect(original).toEqual(snapshot);
  });
});

describe('toErInput', () => {
  it('projects the resolved model into an entities-only DomainExtraction', () => {
    const resolved = setCardinality(seedModel(extraction()), 'e1', 0, 'one_to_many');
    const er = toErInput(resolved);
    expect(er.actors).toEqual([]);
    expect(er.capabilities).toEqual([]);
    expect(er.entities.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(er.entities[0]?.relationships).toEqual([
      { toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' },
    ]);
    expect(er.entities[0]?.attributes).toEqual([
      { name: 'total', type: 'number', required: true, isEnum: false },
      { name: 'status', type: 'string', required: true, isEnum: true },
    ]);
  });
});
