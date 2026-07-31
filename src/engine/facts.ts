/**
 * The facts-merge policy — locked in M1 (technical-plan §2.1, pitfall §7.8).
 *
 * `MustardSession.facts` is the merged store that every bank file's `when`
 * expression reads from (§9.4). Facts arrive from two sources: `maps_to` targets
 * of answered questions, and the `derivedFacts` of the ANALYSE pass. The policy
 * cannot change later, so it is defined here as a pure function:
 *
 *   explicit answers always overwrite derived facts;
 *   derived facts never overwrite answers.
 *
 * Wiring this into the live answer/analysis flow is M5; M1 ships the helper only.
 */

/** A fact value — matches the `MustardSession.facts` value union (§9.3). */
export type FactValue = string | number | boolean;

/** Where a fact came from. Answers win over derived facts. */
export type FactSource = 'answer' | 'derived';

/** One incoming fact to fold into the store. */
export interface IncomingFact {
  key: string;
  value: FactValue;
  source: FactSource;
}

/**
 * Fold `incoming` facts into `current`, honouring the merge policy. Pure: never
 * mutates its arguments, always returns a fresh object.
 *
 * Within a single call, `incoming` is applied in order. An `answer` always wins
 * over whatever a key already holds (so later answers overwrite earlier answers —
 * last-write-wins among answers). A `derived` fact only sets a key that is not
 * already owned by an answer.
 */
export function mergeFacts(
  current: Record<string, FactValue>,
  incoming: IncomingFact[],
): Record<string, FactValue> {
  const merged: Record<string, FactValue> = { ...current };
  // Track which keys are owned by an answer so derived facts can never clobber them.
  const answerKeys = new Set<string>();

  for (const fact of incoming) {
    if (fact.source === 'answer') {
      merged[fact.key] = fact.value;
      answerKeys.add(fact.key);
    } else if (!answerKeys.has(fact.key) && !(fact.key in current)) {
      // Derived facts only fill keys with no answer — neither a prior answer in
      // `current` nor an answer earlier in this batch.
      merged[fact.key] = fact.value;
    }
  }

  return merged;
}
