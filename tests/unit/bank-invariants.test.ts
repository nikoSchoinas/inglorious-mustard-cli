import { describe, expect, it } from 'vitest';
import { PHASES, validateBank } from '../../src/questions/index.js';
import type { Phase } from '../../src/questions/types.js';

describe('validateBank over the shipped bank', () => {
  it('reports zero errors for all present phase modules', () => {
    expect(validateBank(PHASES)).toEqual([]);
  });
});

describe('validateBank catches regressions', () => {
  it('flags a duplicate question id across phases', () => {
    const dup: Phase[] = [
      {
        phase: 0,
        name: 'A',
        seed: [{ id: 'x', type: 'text', prompt: { none: 'a' } }],
        followUpPolicy: { maxGenerated: 0, onlySeverity: [] },
      },
      {
        phase: 1,
        name: 'B',
        seed: [{ id: 'x', type: 'text', prompt: { none: 'b' } }],
        followUpPolicy: { maxGenerated: 0, onlySeverity: [] },
      },
    ];
    const errors = validateBank(dup);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('duplicate-id');
    expect(errors[0]?.questionId).toBe('x');
  });

  it('flags a question missing its `none` variant', () => {
    // Bypass the type system to simulate malformed hand-authored content.
    const bad = {
      phase: 2,
      name: 'C',
      seed: [{ id: 'y', type: 'text', prompt: { developer: 'only dev' } }],
      followUpPolicy: { maxGenerated: 0, onlySeverity: [] },
    } as unknown as Phase;
    const errors = validateBank([bad]);
    expect(errors.map((e) => e.code)).toContain('missing-none');
  });

  it('flags a select with no options', () => {
    const bad: Phase[] = [
      {
        phase: 3,
        name: 'D',
        seed: [{ id: 'z', type: 'select', prompt: { none: 'pick' } }],
        followUpPolicy: { maxGenerated: 0, onlySeverity: [] },
      },
    ];
    const errors = validateBank(bad);
    expect(errors.map((e) => e.code)).toContain('options-required');
  });

  it('flags options on a non-select question', () => {
    const bad: Phase[] = [
      {
        phase: 4,
        name: 'E',
        seed: [
          {
            id: 'w',
            type: 'text',
            prompt: { none: 'name' },
            options: [{ value: 'a', label: 'A' }],
          },
        ],
        followUpPolicy: { maxGenerated: 0, onlySeverity: [] },
      },
    ];
    const errors = validateBank(bad);
    expect(errors.map((e) => e.code)).toContain('options-unexpected');
  });
});
