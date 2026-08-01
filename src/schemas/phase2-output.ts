import { z } from 'zod';
import { DomainExtraction } from './extraction.js';
import { UseCase } from './use-case.js';

/**
 * The complete Phase 2 output (technical-plan §5, M9). Phase 2 part A (M8) leaves a
 * confirmed `DomainExtraction` in `PhaseState.synthesisedObject`; part B (M9) turns
 * that into use cases, runs the failure interrogation, proposes a build order and
 * collects a screen inventory. The whole bundle is stored back into
 * `synthesisedObject` at the start of part B and mutated in place as the
 * interrogation proceeds, so `02-USE-CASES.md` renders from a single typed object.
 *
 * This schema is additive: it consumes the frozen §9.3 `DomainExtraction` and
 * `UseCase` unchanged (neither is altered). Because its shape flows into no LLM
 * fixture key (part B renders deterministically, never synthesises), it is not one
 * of the frozen contracts — but downstream phases depend on it:
 *   - Phase 3 (M10) reads the entities via `Phase2Output.extraction`;
 *   - Phase 6 (M13) reads `Phase2Output.dependencyOrder` to sequence the roadmap.
 */

/** The Phase 2 UI step output (§8.5 step 8): a design approach + a screen inventory. */
export const ScreenInventory = z.object({
  /** The chosen design approach (sketch first / component library / AI UI tool / none). */
  approach: z.string(),
  /** Screen names — an inventory, not designs. */
  screens: z.array(z.string()),
});
export type ScreenInventory = z.infer<typeof ScreenInventory>;

export const Phase2Output = z.object({
  /** Preserved verbatim from part A so Phase 3 can still derive models from entities. */
  extraction: DomainExtraction,
  useCases: z.array(UseCase),
  /** Ordered `UseCase.id`s — the build order confirmed in step 7, consumed by Phase 6. */
  dependencyOrder: z.array(z.string()),
  screens: ScreenInventory,
});
export type Phase2Output = z.infer<typeof Phase2Output>;
