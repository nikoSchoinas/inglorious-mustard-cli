import type { UseCase } from '../schemas/use-case.js';

/**
 * Pure dependency-ordering utilities for Phase 2 step 7 (spec §8.5). The LLM
 * proposes an order over use-case titles; this module maps those back to ids,
 * validates the result is a build-valid permutation, and repairs it deterministically
 * when it is not — so the "valid topological ordering" golden rubric (§10) holds by
 * construction and the order Phase 6 consumes is always complete.
 */

/**
 * Map proposed titles to use-case ids: each title binds to the first not-yet-used
 * use case with that title (case-insensitive). Any use case a title never matched is
 * appended in its original order, so the result is ALWAYS a permutation of every
 * use-case id — a hallucinated, dropped or duplicated title can never corrupt it.
 */
export function orderTitlesToIds(
  titles: readonly string[],
  useCases: readonly UseCase[],
): string[] {
  const used = new Set<string>();
  const order: string[] = [];
  for (const title of titles) {
    const key = title.trim().toLowerCase();
    const match = useCases.find((u) => !used.has(u.id) && u.title.trim().toLowerCase() === key);
    if (match) {
      used.add(match.id);
      order.push(match.id);
    }
  }
  for (const uc of useCases) {
    if (!used.has(uc.id)) {
      order.push(uc.id);
    }
  }
  return order;
}

/**
 * True when `order` lists every use-case id exactly once (a permutation) AND every
 * use case's `dependsOn` ids appear before it. In M9 `dependsOn` is empty, so this
 * reduces to the permutation check — but the dependency check is enforced now so the
 * ordering stays correct if later work populates `dependsOn`.
 */
export function isValidOrder(order: readonly string[], useCases: readonly UseCase[]): boolean {
  const ids = useCases.map((u) => u.id);
  if (order.length !== ids.length) {
    return false;
  }
  const orderSet = new Set(order);
  if (orderSet.size !== order.length) {
    return false; // a duplicate
  }
  for (const id of ids) {
    if (!orderSet.has(id)) {
      return false; // a missing or unknown id
    }
  }
  const position = new Map(order.map((id, i) => [id, i]));
  for (const uc of useCases) {
    const here = position.get(uc.id) ?? -1;
    for (const dep of uc.dependsOn) {
      const there = position.get(dep);
      if (there === undefined || there > here) {
        return false; // dependency comes after (or is unknown)
      }
    }
  }
  return true;
}

/**
 * A deterministic dependency-respecting order via Kahn's algorithm over `dependsOn`.
 * Ties break on the use cases' original order. A dependency cycle leaves nodes
 * unprocessable; those are appended in original order (a warning is the caller's
 * concern) rather than throwing — the interrogation must never dead-end.
 */
export function topoOrder(useCases: readonly UseCase[]): string[] {
  const ids = useCases.map((u) => u.id);
  const known = new Set(ids);
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const uc of useCases) {
    for (const dep of uc.dependsOn) {
      if (!known.has(dep)) {
        continue; // ignore edges to unknown ids
      }
      indegree.set(uc.id, (indegree.get(uc.id) ?? 0) + 1);
      dependents.get(dep)?.push(uc.id);
    }
  }

  const order: string[] = [];
  const placed = new Set<string>();
  // Repeatedly take ready nodes (indegree 0) in original order, so ties are stable.
  let progress = true;
  while (progress) {
    progress = false;
    for (const id of ids) {
      if (placed.has(id) || (indegree.get(id) ?? 0) !== 0) {
        continue;
      }
      placed.add(id);
      order.push(id);
      progress = true;
      for (const child of dependents.get(id) ?? []) {
        indegree.set(child, (indegree.get(child) ?? 0) - 1);
      }
    }
  }

  // Any nodes left are in a cycle — append them in original order.
  for (const id of ids) {
    if (!placed.has(id)) {
      order.push(id);
    }
  }
  return order;
}

/** Return `proposed` if it is a build-valid permutation, else the deterministic topo order. */
export function repairOrder(proposed: readonly string[], useCases: readonly UseCase[]): string[] {
  return isValidOrder(proposed, useCases) ? [...proposed] : topoOrder(useCases);
}
