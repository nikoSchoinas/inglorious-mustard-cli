import { describe, expect, it } from 'vitest';
import { fact } from '../../src/questions/fact.js';
import { filterQuestions, resolvePrompt } from '../../src/questions/index.js';
import type { Facts, Question } from '../../src/questions/types.js';

describe('fact()', () => {
  const facts: Facts = { 'needs.storage': true, actorCount: 3 };

  it('returns the value for a present key', () => {
    expect(fact(facts, 'needs.storage')).toBe(true);
    expect(fact(facts, 'actorCount')).toBe(3);
  });

  it('returns undefined for an absent key with no fallback', () => {
    expect(fact(facts, 'nope')).toBeUndefined();
  });

  it('returns the fallback for an absent key', () => {
    expect(fact(facts, 'nope', 0)).toBe(0);
    expect(fact(facts, 'nope', 'default')).toBe('default');
  });
});

describe('when predicates + absent facts', () => {
  const predicate: Question['when'] = (f) => Number(fact(f, 'actorCount', 0)) > 1;

  it('does not throw and is false when the referenced fact is absent', () => {
    expect(() => predicate?.({})).not.toThrow();
    expect(predicate?.({})).toBe(false);
  });

  it('is false via direct Number(undefined) access too', () => {
    const direct: Question['when'] = (f) => Number(f.actorCount) > 1;
    expect(direct?.({})).toBe(false); // Number(undefined) === NaN, NaN > 1 === false
  });

  it('is true when the fact satisfies the predicate', () => {
    expect(predicate?.({ actorCount: 2 })).toBe(true);
  });
});

describe('resolvePrompt fallback', () => {
  const q: Question = {
    id: 'x.only-none-and-developer',
    type: 'select',
    prompt: { none: 'plain', developer: 'terse' },
    options: [{ value: 'a', label: 'A' }],
  };

  it('uses the exact register when present', () => {
    expect(resolvePrompt(q, 'none')).toBe('plain');
    expect(resolvePrompt(q, 'developer')).toBe('terse');
  });

  it('falls back to none for a missing variant (the p4.concurrent case)', () => {
    expect(resolvePrompt(q, 'some')).toBe('plain');
  });
});

describe('filterQuestions', () => {
  const always: Question = { id: 'a', type: 'text', prompt: { none: 'a' } };
  const gated: Question = {
    id: 'b',
    type: 'text',
    prompt: { none: 'b' },
    when: (f) => Number(fact(f, 'actorCount', 0)) > 1,
  };

  it('always keeps a question with no `when`', () => {
    expect(filterQuestions([always], {}).map((q) => q.id)).toEqual(['a']);
  });

  it('drops a gated question when its fact is absent', () => {
    expect(filterQuestions([always, gated], {}).map((q) => q.id)).toEqual(['a']);
  });

  it('keeps a gated question when its predicate passes', () => {
    expect(filterQuestions([always, gated], { actorCount: 5 }).map((q) => q.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
