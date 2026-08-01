/**
 * The facts-merge policy — locked in M1 (technical-plan §2.1, pitfall §7.8).
 *
 * `MustardSession.facts` is the merged store that every bank module's `when`
 * predicate reads from (§9.4). Facts arrive from two sources: `mapsTo` targets
 * of answered questions, and the `derivedFacts` of the ANALYSE pass. The policy
 * cannot change later, so it is defined here as a pure function:
 *
 *   explicit answers always overwrite derived facts;
 *   derived facts never overwrite answers;
 *   derived facts MAY overwrite earlier derived facts — a re-ANALYSE with new
 *   follow-up answers must be able to correct its own earlier reading.
 *
 * Distinguishing the last two cases requires provenance, which the value store
 * alone cannot carry — so the session keeps a parallel `factSources` record and
 * the merge is over both. A key present in `facts` with no recorded source (a
 * session persisted before provenance existed) is treated as answer-owned: the
 * conservative reading that preserves the old behaviour for legacy sessions.
 */

/**
 * A fact value — matches the `MustardSession.facts` value union (§9.3).
 * Arrays enter the store via multiselect `mapsTo` answers; ANALYSE
 * `derivedFacts` remain scalar strings.
 */
export type FactValue = string | number | boolean | readonly string[];

/** Where a fact came from. Answers win over derived facts. */
export type FactSource = 'answer' | 'derived';

/** One incoming fact to fold into the store. */
export interface IncomingFact {
  key: string;
  value: FactValue;
  source: FactSource;
}

/** The merged store plus its provenance, returned together so they never drift. */
export interface FactsMergeResult {
  facts: Record<string, FactValue>;
  sources: Record<string, FactSource>;
}

/**
 * Fold `incoming` facts into `facts`/`sources`, honouring the merge policy.
 * Pure: never mutates its arguments, always returns fresh objects.
 *
 * Within a single call, `incoming` is applied in order. An `answer` always wins
 * over whatever a key already holds (so later answers overwrite earlier answers —
 * last-write-wins among answers). A `derived` fact only sets a key that is not
 * owned by an answer — whether that ownership was recorded in `sources`, implied
 * by a legacy key with no recorded source, or established by an answer earlier
 * in this batch.
 */
export function mergeFacts(
  facts: Record<string, FactValue>,
  sources: Record<string, FactSource>,
  incoming: IncomingFact[],
): FactsMergeResult {
  const mergedFacts: Record<string, FactValue> = { ...facts };
  const mergedSources: Record<string, FactSource> = { ...sources };

  const answerOwned = (key: string): boolean =>
    mergedSources[key] === 'answer' ||
    // Legacy keys (present before provenance tracking) default to answer-owned.
    (mergedSources[key] === undefined && key in mergedFacts);

  for (const fact of incoming) {
    if (fact.source === 'answer') {
      mergedFacts[fact.key] = fact.value;
      mergedSources[fact.key] = 'answer';
    } else if (!answerOwned(fact.key)) {
      mergedFacts[fact.key] = fact.value;
      mergedSources[fact.key] = 'derived';
    }
  }

  return { facts: mergedFacts, sources: mergedSources };
}

/**
 * Apply a merge to a session-shaped holder of `facts` + `factSources`, mutating
 * the given object (the runner's cloned `next` session) in place. Small sugar so
 * every call site stays a one-liner and cannot forget to update the provenance
 * alongside the values.
 */
export function applyFacts(
  target: {
    facts: Record<string, FactValue>;
    factSources: Record<string, FactSource>;
  },
  incoming: IncomingFact[],
): void {
  const merged = mergeFacts(target.facts, target.factSources, incoming);
  target.facts = merged.facts;
  target.factSources = merged.sources;
}
