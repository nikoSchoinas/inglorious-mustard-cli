import { z } from 'zod';
import { StackDecision } from './stack.js';
import { UseCase } from './use-case.js';

/**
 * The Phase 5 output (spec §8.8, technical-plan §5, M12): the architecture
 * *derived* from Phases 2–4 plus the two seed answers — a component graph, the
 * 2–3 riskiest use-case flows to draw as sequence diagrams, an ADR log, and the
 * three decisions most expensive to reverse (the irreversibility gate).
 *
 * Two schemas, deliberately split:
 *   - `Architecture` is the STRICT `synthesise-architecture` pass output (its
 *     shape and `promptVersion` flow into the fixture key). Its array bounds
 *     (2–3 sequence selections, exactly 3 irreversible decisions) hold the deep
 *     model to the §8.8 contract at generation time.
 *   - `Phase5Output` is the RELAXED object persisted to
 *     `PhaseState.synthesisedObject` and consumed by BOTH renderers
 *     (`05-ARCHITECTURE.md`, `05-DECISIONS.md`) — mirroring how `Phase4Output`
 *     wraps the strict `StackProposal`. It carries the flow-added
 *     `confirmations` (the per-decision gate outcome) and the resolved
 *     `selectedUseCases`, and drops the bounds so a degraded fallback (empty
 *     arrays, §9.8) still round-trips. It flows into no fixture key.
 */

/**
 * One component node. `category` reuses the frozen `StackDecision` enum so a node
 * drops straight into the `ComponentGraph` interface the M7 `component.ts`
 * renderer consumes.
 */
export const ArchComponent = z.object({
  id: z.string(), // stable slug; connections reference these
  label: z.string(),
  category: StackDecision.shape.category,
});
export type ArchComponent = z.infer<typeof ArchComponent>;

/** One directed edge between components (a data/control flow). */
export const ArchConnection = z.object({
  from: z.string(), // ArchComponent.id
  to: z.string(),
  label: z.string().optional(), // e.g. "uploads", "reads"
});
export type ArchConnection = z.infer<typeof ArchConnection>;

/** The component (architecture) graph — nodes plus the real edges between them. */
export const ComponentGraphSpec = z.object({
  components: z.array(ArchComponent),
  connections: z.array(ArchConnection),
});
export type ComponentGraphSpec = z.infer<typeof ComponentGraphSpec>;

/**
 * A sequence-diagram SELECTION — references a Phase 2 `UseCase` by id, never
 * re-emits it (single source of truth). The LLM picks the 2–3 riskiest flows by
 * `failurePathCount` then `crossComponentReach` and MUST explain the choice in
 * `rationale`, which the artifact surfaces (§8.8).
 */
export const SequenceSelection = z.object({
  useCaseId: z.string(), // must match a Phase2Output.useCases[].id
  failurePathCount: z.number().int(),
  crossComponentReach: z.number().int(),
  rationale: z.string(),
});
export type SequenceSelection = z.infer<typeof SequenceSelection>;

/** One architecture decision record. `05-DECISIONS.md` renders the log. */
export const AdrEntry = z.object({
  id: z.string(), // ADR-001…
  title: z.string(),
  status: z.enum(['proposed', 'accepted', 'superseded']).default('accepted'),
  context: z.string(),
  decision: z.string(),
  consequences: z.string(),
});
export type AdrEntry = z.infer<typeof AdrEntry>;

/**
 * One of the three decisions most expensive to reverse in six months, in plain
 * language with the consequence spelled out (§8.8). Each is confirmed
 * individually at the irreversibility gate.
 */
export const IrreversibleDecision = z.object({
  id: z.string(), // IRR-1 / IRR-2 / IRR-3
  title: z.string(), // plain-language name
  plainLanguage: z.string(), // what the decision is, no jargon
  consequence: z.string(), // what it costs to reverse later
});
export type IrreversibleDecision = z.infer<typeof IrreversibleDecision>;

/**
 * The strict `synthesise-architecture` pass output. Bounds enforce the §8.8
 * contract at generation time: 2–3 sequence selections, exactly three
 * irreversible decisions. `version` on the system prompt flows into the fixture
 * key — bump it on any wording change.
 */
export const Architecture = z.object({
  componentGraph: ComponentGraphSpec,
  sequenceSelections: z.array(SequenceSelection).min(1).max(3),
  adrs: z.array(AdrEntry),
  irreversibleDecisions: z.array(IrreversibleDecision).length(3),
});
export type Architecture = z.infer<typeof Architecture>;

/**
 * The per-decision outcome of the irreversibility gate. Recorded even when the
 * user declines (`confirmed: false`) — the gate never traps the user, and
 * `05-DECISIONS.md` renders the non-confirmation honestly (technical-plan §M12).
 */
export const IrreversibleConfirmation = z.object({
  decisionId: z.string(),
  confirmed: z.boolean(),
  confirmedAt: z.string(),
});
export type IrreversibleConfirmation = z.infer<typeof IrreversibleConfirmation>;

/**
 * The Phase 5 object persisted to `PhaseState.synthesisedObject` and consumed by
 * both renderers. Relaxed (no array bounds) so the degraded fallback round-trips;
 * carries the resolved `selectedUseCases` (so the renderer stays a pure function
 * of its typed object) and the flow-added `confirmations`.
 */
export const Phase5Output = z.object({
  componentGraph: ComponentGraphSpec,
  sequenceSelections: z.array(SequenceSelection),
  /** The `UseCase` objects resolved from `sequenceSelections[].useCaseId` at synthesis time. */
  selectedUseCases: z.array(UseCase),
  adrs: z.array(AdrEntry),
  irreversibleDecisions: z.array(IrreversibleDecision),
  confirmations: z.array(IrreversibleConfirmation).default([]),
});
export type Phase5Output = z.infer<typeof Phase5Output>;
