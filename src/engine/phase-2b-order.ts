import type { UseCase } from '../schemas/use-case.js';
import {
  isValidOrder as genericIsValidOrder,
  repairOrder as genericRepairOrder,
  topoOrder as genericTopoOrder,
} from './topo.js';

/**
 * Dependency-ordering for Phase 2 step 7 (spec §8.5). The LLM proposes an order
 * over use-case titles; this module maps those back to ids, then delegates the
 * topological ordering/validation/repair to the generic `topo.ts` utilities
 * (shared with Phase 6's task sequencing) so the "valid topological ordering"
 * golden rubric (§10) holds by construction and the order Phase 6 consumes is
 * always complete. Only `orderTitlesToIds` is `UseCase`-specific (it reads
 * `title`); the rest are thin `UseCase`-typed re-exports.
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

/** See `topo.isValidOrder` — `UseCase` satisfies the `DependencyNode` shape. */
export function isValidOrder(order: readonly string[], useCases: readonly UseCase[]): boolean {
  return genericIsValidOrder(order, useCases);
}

/** See `topo.topoOrder` — `UseCase` satisfies the `DependencyNode` shape. */
export function topoOrder(useCases: readonly UseCase[]): string[] {
  return genericTopoOrder(useCases);
}

/** See `topo.repairOrder` — `UseCase` satisfies the `DependencyNode` shape. */
export function repairOrder(proposed: readonly string[], useCases: readonly UseCase[]): string[] {
  return genericRepairOrder(proposed, useCases);
}
