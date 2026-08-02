/**
 * Generic dependency-ordering utilities (spec §10 "valid topological ordering").
 * Pure functions over any node carrying a stable `id` and a `dependsOn` list of
 * ids — Phase 2's `UseCase` (via `phase-2b-order.ts`) and Phase 6's `Task` both
 * satisfy the shape. Kahn's algorithm; a dependency cycle never throws (the
 * interrogation must never dead-end) — the cyclic nodes are appended in original
 * order and the caller decides whether to warn.
 */

/** The minimal shape these utilities order over. */
export interface DependencyNode {
  id: string;
  dependsOn: readonly string[];
}

/**
 * True when `order` lists every node id exactly once (a permutation) AND every
 * node's `dependsOn` ids appear before it.
 */
export function isValidOrder(order: readonly string[], nodes: readonly DependencyNode[]): boolean {
  const ids = nodes.map((n) => n.id);
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
  for (const node of nodes) {
    const here = position.get(node.id) ?? -1;
    for (const dep of node.dependsOn) {
      const there = position.get(dep);
      if (there === undefined || there > here) {
        return false; // dependency comes after (or is unknown)
      }
    }
  }
  return true;
}

/**
 * A deterministic dependency-respecting order via Kahn's algorithm over
 * `dependsOn`. Ties break on the nodes' original order. Nodes left in a cycle are
 * appended in original order rather than throwing.
 */
export function topoOrder(nodes: readonly DependencyNode[]): string[] {
  const ids = nodes.map((n) => n.id);
  const known = new Set(ids);
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!known.has(dep)) {
        continue; // ignore edges to unknown ids
      }
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      dependents.get(dep)?.push(node.id);
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
export function repairOrder(
  proposed: readonly string[],
  nodes: readonly DependencyNode[],
): string[] {
  return isValidOrder(proposed, nodes) ? [...proposed] : topoOrder(nodes);
}
