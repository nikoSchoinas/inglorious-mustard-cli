import type { FactValue } from '../engine/facts.js';
import type { Facts } from './types.js';

/**
 * The blessed accessor for `when` predicates (§9.4). Returns the raw fact value,
 * or `fallback` (default `undefined`) when the key is absent — so a predicate
 * that references a missing fact naturally evaluates to a falsy value and never
 * throws. This is how "an absent fact ⇒ predicate is false" is achieved, rather
 * than by wrapping predicates in try/catch (a genuinely throwing predicate is a
 * bug and must surface).
 *
 * Keys are the full dotted `mapsTo` string, e.g. `fact(f, 'needs.objectStorage')`
 * or `fact(f, 'actorCount')` — never chained property access.
 *
 * @example
 *   when: (f) => Number(fact(f, 'actorCount', 0)) > 1
 */
export function fact(facts: Facts, key: string): FactValue | undefined;
export function fact(facts: Facts, key: string, fallback: FactValue): FactValue;
export function fact(facts: Facts, key: string, fallback?: FactValue): FactValue | undefined {
  const value = facts[key];
  return value === undefined ? fallback : value;
}
