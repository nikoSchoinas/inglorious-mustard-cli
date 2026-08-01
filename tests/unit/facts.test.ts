import { describe, expect, it } from 'vitest';
import { mergeFacts } from '../../src/engine/facts.js';

describe('mergeFacts', () => {
  it('lets an answer overwrite a prior derived fact', () => {
    const current = { 'needs.storage': 'maybe' };
    const merged = mergeFacts(current, [{ key: 'needs.storage', value: true, source: 'answer' }]);
    expect(merged['needs.storage']).toBe(true);
  });

  it('does not let a derived fact overwrite an existing answer', () => {
    const current = { 'needs.storage': true };
    const merged = mergeFacts(current, [{ key: 'needs.storage', value: false, source: 'derived' }]);
    expect(merged['needs.storage']).toBe(true);
  });

  it('lets a derived fact fill a key with no prior value', () => {
    const merged = mergeFacts({}, [{ key: 'facts.actorCount', value: 2, source: 'derived' }]);
    expect(merged['facts.actorCount']).toBe(2);
  });

  it('makes answers win over derived within a single batch, regardless of order', () => {
    const derivedFirst = mergeFacts({}, [
      { key: 'k', value: 'derived', source: 'derived' },
      { key: 'k', value: 'answer', source: 'answer' },
    ]);
    const answerFirst = mergeFacts({}, [
      { key: 'k', value: 'answer', source: 'answer' },
      { key: 'k', value: 'derived', source: 'derived' },
    ]);
    expect(derivedFirst.k).toBe('answer');
    expect(answerFirst.k).toBe('answer');
  });

  it('lets a later answer overwrite an earlier answer', () => {
    const merged = mergeFacts({}, [
      { key: 'k', value: 'first', source: 'answer' },
      { key: 'k', value: 'second', source: 'answer' },
    ]);
    expect(merged.k).toBe('second');
  });

  it('is pure — it never mutates its input', () => {
    const current = { a: 1 };
    const merged = mergeFacts(current, [{ key: 'b', value: 2, source: 'answer' }]);
    expect(current).toEqual({ a: 1 });
    expect(merged).not.toBe(current);
  });

  it('round-trips string, number and boolean values', () => {
    const merged = mergeFacts({}, [
      { key: 's', value: 'text', source: 'answer' },
      { key: 'n', value: 42, source: 'answer' },
      { key: 'b', value: true, source: 'answer' },
    ]);
    expect(merged).toEqual({ s: 'text', n: 42, b: true });
  });

  it('lets an answer-sourced array (multiselect) overwrite a derived scalar', () => {
    const current = { 'manifesto.rules': 'stale-derived' };
    const merged = mergeFacts(current, [
      { key: 'manifesto.rules', value: ['ship-before-perfect', 'write-my-own'], source: 'answer' },
    ]);
    expect(merged['manifesto.rules']).toEqual(['ship-before-perfect', 'write-my-own']);
  });

  it('does not let a derived fact overwrite an answer-sourced array', () => {
    const current = { 'manifesto.rules': ['write-my-own'] };
    const merged = mergeFacts(current, [
      { key: 'manifesto.rules', value: 'derived', source: 'derived' },
    ]);
    expect(merged['manifesto.rules']).toEqual(['write-my-own']);
  });
});
