import { describe, expect, it } from 'vitest';
import { type FactSource, type FactValue, applyFacts, mergeFacts } from '../../src/engine/facts.js';

/** Sugar: merge into an empty store. */
function merge(
  facts: Record<string, FactValue>,
  sources: Record<string, FactSource>,
  incoming: Parameters<typeof mergeFacts>[2],
) {
  return mergeFacts(facts, sources, incoming);
}

describe('mergeFacts', () => {
  it('lets an answer overwrite a prior derived fact', () => {
    const merged = merge({ 'needs.storage': 'maybe' }, { 'needs.storage': 'derived' }, [
      { key: 'needs.storage', value: true, source: 'answer' },
    ]);
    expect(merged.facts['needs.storage']).toBe(true);
    expect(merged.sources['needs.storage']).toBe('answer');
  });

  it('does not let a derived fact overwrite an existing answer', () => {
    const merged = merge({ 'needs.storage': true }, { 'needs.storage': 'answer' }, [
      { key: 'needs.storage', value: false, source: 'derived' },
    ]);
    expect(merged.facts['needs.storage']).toBe(true);
    expect(merged.sources['needs.storage']).toBe('answer');
  });

  it('lets a derived fact overwrite an earlier derived fact (re-ANALYSE correction)', () => {
    const merged = merge({ 'needs.concurrency': 'low' }, { 'needs.concurrency': 'derived' }, [
      { key: 'needs.concurrency', value: 'high', source: 'derived' },
    ]);
    expect(merged.facts['needs.concurrency']).toBe('high');
    expect(merged.sources['needs.concurrency']).toBe('derived');
  });

  it('treats a legacy key with no recorded source as answer-owned', () => {
    // A session persisted before provenance tracking: key exists, source unknown.
    const merged = merge({ 'needs.storage': true }, {}, [
      { key: 'needs.storage', value: false, source: 'derived' },
    ]);
    expect(merged.facts['needs.storage']).toBe(true);
  });

  it('lets a derived fact fill a key with no prior value', () => {
    const merged = merge({}, {}, [{ key: 'facts.actorCount', value: 2, source: 'derived' }]);
    expect(merged.facts['facts.actorCount']).toBe(2);
    expect(merged.sources['facts.actorCount']).toBe('derived');
  });

  it('makes answers win over derived within a single batch, regardless of order', () => {
    const derivedFirst = merge({}, {}, [
      { key: 'k', value: 'derived', source: 'derived' },
      { key: 'k', value: 'answer', source: 'answer' },
    ]);
    const answerFirst = merge({}, {}, [
      { key: 'k', value: 'answer', source: 'answer' },
      { key: 'k', value: 'derived', source: 'derived' },
    ]);
    expect(derivedFirst.facts.k).toBe('answer');
    expect(answerFirst.facts.k).toBe('answer');
  });

  it('lets a later answer overwrite an earlier answer', () => {
    const merged = merge({}, {}, [
      { key: 'k', value: 'first', source: 'answer' },
      { key: 'k', value: 'second', source: 'answer' },
    ]);
    expect(merged.facts.k).toBe('second');
  });

  it('is pure — it never mutates its inputs', () => {
    const facts = { a: 1 };
    const sources: Record<string, FactSource> = { a: 'answer' };
    const merged = merge(facts, sources, [{ key: 'b', value: 2, source: 'answer' }]);
    expect(facts).toEqual({ a: 1 });
    expect(sources).toEqual({ a: 'answer' });
    expect(merged.facts).not.toBe(facts);
    expect(merged.sources).not.toBe(sources);
  });

  it('round-trips string, number and boolean values', () => {
    const merged = merge({}, {}, [
      { key: 's', value: 'text', source: 'answer' },
      { key: 'n', value: 42, source: 'answer' },
      { key: 'b', value: true, source: 'answer' },
    ]);
    expect(merged.facts).toEqual({ s: 'text', n: 42, b: true });
  });

  it('lets an answer-sourced array (multiselect) overwrite a derived scalar', () => {
    const merged = merge({ 'manifesto.rules': 'stale-derived' }, { 'manifesto.rules': 'derived' }, [
      {
        key: 'manifesto.rules',
        value: ['ship-before-perfect', 'write-my-own'],
        source: 'answer',
      },
    ]);
    expect(merged.facts['manifesto.rules']).toEqual(['ship-before-perfect', 'write-my-own']);
  });

  it('does not let a derived fact overwrite an answer-sourced array', () => {
    const merged = merge({ 'manifesto.rules': ['write-my-own'] }, { 'manifesto.rules': 'answer' }, [
      { key: 'manifesto.rules', value: 'derived', source: 'derived' },
    ]);
    expect(merged.facts['manifesto.rules']).toEqual(['write-my-own']);
  });
});

describe('applyFacts', () => {
  it('updates facts and factSources together on the target', () => {
    const target = {
      facts: { existing: 'derived-value' } as Record<string, FactValue>,
      factSources: { existing: 'derived' } as Record<string, FactSource>,
    };
    applyFacts(target, [
      { key: 'existing', value: 'answered', source: 'answer' },
      { key: 'fresh', value: 1, source: 'derived' },
    ]);
    expect(target.facts).toEqual({ existing: 'answered', fresh: 1 });
    expect(target.factSources).toEqual({ existing: 'answer', fresh: 'derived' });
  });
});
