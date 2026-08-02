import { describe, expect, it } from 'vitest';
import {
  type DependencyNode,
  isValidOrder,
  repairOrder,
  topoOrder,
} from '../../src/engine/topo.js';

/** Build nodes tersely: `n('a', ['b'])` → depends on b. */
function n(id: string, dependsOn: string[] = []): DependencyNode {
  return { id, dependsOn };
}

describe('topoOrder', () => {
  it('orders dependencies before dependents, ties on original order', () => {
    // t1 depends on t2; t2 depends on t3 → t3, t2, t1. t4 is free and keeps its slot.
    const nodes = [n('t1', ['t2']), n('t2', ['t3']), n('t3'), n('t4')];
    expect(topoOrder(nodes)).toEqual(['t3', 't4', 't2', 't1']);
  });

  it('is stable for a fully independent set', () => {
    const nodes = [n('a'), n('b'), n('c')];
    expect(topoOrder(nodes)).toEqual(['a', 'b', 'c']);
  });

  it('ignores edges to unknown ids rather than throwing', () => {
    const nodes = [n('a', ['ghost']), n('b')];
    expect(topoOrder(nodes)).toEqual(['a', 'b']);
  });

  it('appends cyclic nodes in original order instead of throwing', () => {
    const cyclic = [n('a', ['b']), n('b', ['a']), n('c')];
    // c is free and placed first; the a↔b cycle is appended in original order.
    expect(topoOrder(cyclic)).toEqual(['c', 'a', 'b']);
    // Every node still appears exactly once (never dead-ends).
    expect([...topoOrder(cyclic)].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('isValidOrder', () => {
  const nodes = [n('a'), n('b', ['a']), n('c', ['b'])];

  it('accepts a permutation that respects every dependency', () => {
    expect(isValidOrder(['a', 'b', 'c'], nodes)).toBe(true);
  });

  it('rejects a dependency that comes after its dependent', () => {
    expect(isValidOrder(['b', 'a', 'c'], nodes)).toBe(false);
  });

  it('rejects missing, unknown, or duplicate ids', () => {
    expect(isValidOrder(['a', 'b'], nodes)).toBe(false); // missing c
    expect(isValidOrder(['a', 'b', 'z'], nodes)).toBe(false); // unknown z
    expect(isValidOrder(['a', 'a', 'b', 'c'], nodes)).toBe(false); // duplicate a
  });
});

describe('repairOrder', () => {
  const nodes = [n('t1', ['t2']), n('t2'), n('t3')];

  it('keeps a valid proposed order untouched', () => {
    expect(repairOrder(['t2', 't3', 't1'], nodes)).toEqual(['t2', 't3', 't1']);
  });

  it('falls back to the deterministic topo order when the proposal is invalid', () => {
    // Proposal places t1 before its dependency t2 → repaired to a valid topo order.
    expect(repairOrder(['t1', 't2', 't3'], nodes)).toEqual(topoOrder(nodes));
    expect(isValidOrder(repairOrder(['t1', 't2', 't3'], nodes), nodes)).toBe(true);
  });
});
