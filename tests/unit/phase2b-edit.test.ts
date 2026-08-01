import { describe, expect, it } from 'vitest';
import {
  deriveScreens,
  fallbackFailurePath,
  parseHappyPathText,
  renderHappyPathForEdit,
  seedUseCases,
  setDependencyOrder,
  setFailurePaths,
  setHappyPath,
  setScreens,
  wrapExtraction,
} from '../../src/engine/phase-2b-edit.js';
import {
  isValidOrder,
  orderTitlesToIds,
  repairOrder,
  topoOrder,
} from '../../src/engine/phase-2b-order.js';
import type { DomainExtraction } from '../../src/schemas/extraction.js';
import type { UseCase } from '../../src/schemas/use-case.js';

/**
 * Pure-logic tests for Phase 2B (M9): use-case seeding and id stability, the
 * happy-path text round-trip, the failure-path fallback, and dependency-order
 * validation and repair. No prompter, no LLM.
 */

function extraction(): DomainExtraction {
  return {
    actors: [{ id: 'a1', name: 'Member', description: 'The user', isPrimary: true }],
    entities: [],
    capabilities: [
      { id: 'c1', actorId: 'a1', verb: 'create', object: 'habit', description: 'add one' },
      { id: 'c2', actorId: 'a1', verb: 'check in', object: 'habit', description: 'mark done' },
      { id: 'c3', actorId: 'a1', verb: 'set a reminder', object: '', description: 'remind me' },
    ],
  };
}

describe('seedUseCases', () => {
  it('mints one gap-free use case per capability, titled from verb + object', () => {
    const useCases = seedUseCases(extraction());
    expect(useCases.map((u) => u.id)).toEqual(['uc1', 'uc2', 'uc3']);
    expect(useCases.map((u) => u.title)).toEqual([
      'create habit',
      'check in habit',
      'set a reminder',
    ]);
    expect(useCases.every((u) => u.actorId === 'a1')).toBe(true);
    expect(useCases.every((u) => u.happyPath.length === 0 && u.failurePaths.length === 0)).toBe(
      true,
    );
  });
});

describe('setHappyPath / setFailurePaths — immutability and isolation', () => {
  it('sets one use case without touching the others or the input', () => {
    const output = wrapExtraction(extraction());
    const next = setHappyPath(output, 'uc2', [{ actor: 'user', action: 'does a thing' }]);

    expect(next.useCases.find((u) => u.id === 'uc2')?.happyPath).toHaveLength(1);
    expect(next.useCases.find((u) => u.id === 'uc1')?.happyPath).toHaveLength(0);
    // input untouched
    expect(output.useCases.find((u) => u.id === 'uc2')?.happyPath).toHaveLength(0);

    const withFail = setFailurePaths(next, 'uc2', [fallbackFailurePath()]);
    expect(withFail.useCases.find((u) => u.id === 'uc2')?.failurePaths).toHaveLength(1);
    // happyPath from the prior step survives
    expect(withFail.useCases.find((u) => u.id === 'uc2')?.happyPath).toHaveLength(1);
  });
});

describe('parseHappyPathText', () => {
  it('round-trips rendered steps', () => {
    const steps: Array<{ actor: 'user' | 'system' | 'database' | 'external'; action: string }> = [
      { actor: 'user', action: 'taps New Habit' },
      { actor: 'system', action: 'validates it' },
      { actor: 'database', action: 'stores it' },
    ];
    expect(parseHappyPathText(renderHappyPathForEdit(steps))).toEqual(steps);
  });

  it('treats an unrecognised prefix as a user action and skips blank lines', () => {
    const parsed = parseHappyPathText('opens the app\n\nsystem: responds\n');
    expect(parsed).toEqual([
      { actor: 'user', action: 'opens the app' },
      { actor: 'system', action: 'responds' },
    ]);
  });
});

describe('deriveScreens', () => {
  it('derives one screen per use case plus Sign in / Settings, de-duplicated', () => {
    const output = wrapExtraction(extraction());
    expect(deriveScreens(output.useCases)).toEqual([
      'Create habit',
      'Check in habit',
      'Set a reminder',
      'Sign in',
      'Settings',
    ]);
  });
});

describe('setScreens', () => {
  it('de-duplicates the chosen screens case-insensitively', () => {
    const output = wrapExtraction(extraction());
    const next = setScreens(output, 'sketch', ['Home', 'home', 'Settings']);
    expect(next.screens).toEqual({ approach: 'sketch', screens: ['Home', 'Settings'] });
  });
});

// --------------------------------------------------------------------------
// ordering
// --------------------------------------------------------------------------

function ucs(deps: Record<string, string[]> = {}): UseCase[] {
  return ['uc1', 'uc2', 'uc3'].map((id) => ({
    id,
    title: id,
    actorId: 'a1',
    preconditions: [],
    happyPath: [],
    failurePaths: [],
    dependsOn: deps[id] ?? [],
  }));
}

describe('orderTitlesToIds', () => {
  it('maps proposed titles to ids and always returns a full permutation', () => {
    const useCases = seedUseCases(extraction());
    const ids = orderTitlesToIds(['set a reminder', 'create habit'], useCases);
    // the two named come first in order; the unnamed one is appended.
    expect(ids).toEqual(['uc3', 'uc1', 'uc2']);
  });

  it('ignores an unknown/duplicate title without corrupting the permutation', () => {
    const useCases = seedUseCases(extraction());
    const ids = orderTitlesToIds(['ghost', 'create habit', 'create habit'], useCases);
    expect([...ids].sort()).toEqual(['uc1', 'uc2', 'uc3']);
  });
});

describe('isValidOrder', () => {
  it('accepts a permutation and rejects a missing or extra id', () => {
    expect(isValidOrder(['uc1', 'uc2', 'uc3'], ucs())).toBe(true);
    expect(isValidOrder(['uc1', 'uc2'], ucs())).toBe(false); // missing
    expect(isValidOrder(['uc1', 'uc2', 'uc9'], ucs())).toBe(false); // unknown
    expect(isValidOrder(['uc1', 'uc1', 'uc2'], ucs())).toBe(false); // duplicate
  });

  it('rejects an order that violates a declared dependency', () => {
    const withDep = ucs({ uc1: ['uc2'] }); // uc1 depends on uc2 → uc2 must come first
    expect(isValidOrder(['uc1', 'uc2', 'uc3'], withDep)).toBe(false);
    expect(isValidOrder(['uc2', 'uc1', 'uc3'], withDep)).toBe(true);
  });
});

describe('topoOrder / repairOrder', () => {
  it('respects dependencies and repairs an invalid proposal', () => {
    const withDep = ucs({ uc1: ['uc3'] }); // uc3 before uc1
    expect(topoOrder(withDep)).toEqual(['uc2', 'uc3', 'uc1']);
    // an invalid proposal is repaired to the topo order
    expect(repairOrder(['uc1', 'uc2', 'uc3'], withDep)).toEqual(['uc2', 'uc3', 'uc1']);
    // a valid proposal is returned as-is
    expect(repairOrder(['uc3', 'uc1', 'uc2'], withDep)).toEqual(['uc3', 'uc1', 'uc2']);
  });

  it('does not dead-end on a dependency cycle', () => {
    const cyclic = ucs({ uc1: ['uc2'], uc2: ['uc1'] });
    // both cycle members are still emitted (in original order), never dropped.
    expect([...topoOrder(cyclic)].sort()).toEqual(['uc1', 'uc2', 'uc3']);
  });
});

describe('setDependencyOrder', () => {
  it('records the order immutably', () => {
    const output = wrapExtraction(extraction());
    const next = setDependencyOrder(output, ['uc3', 'uc1', 'uc2']);
    expect(next.dependencyOrder).toEqual(['uc3', 'uc1', 'uc2']);
    expect(output.dependencyOrder).toEqual([]);
  });
});
