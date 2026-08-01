import { z } from 'zod';
import { FolderTree } from './structure.js';

/**
 * Output of the Phase 4 PROPOSE-STACK pass (spec §9.3): one technology decision
 * with a plain-language justification and exactly two alternatives.
 * `locked: true` marks an "I already decided" choice that must survive any
 * redo (§8.7).
 */
export const StackDecision = z.object({
  componentId: z.string(),
  category: z.enum([
    'frontend',
    'backend',
    'database',
    'auth',
    'storage',
    'payments',
    'email',
    'queue',
    'hosting',
    'inference',
    'monitoring',
    'ide',
  ]),
  choice: z.string(),
  justification: z.string(), // plain language, one paragraph
  alternatives: z.array(z.object({ name: z.string(), tradeoff: z.string() })).length(2),
  locked: z.boolean().default(false),
});
export type StackDecision = z.infer<typeof StackDecision>;

/**
 * The batch output of the `propose-stack` deep pass: every component the derived
 * `needs.*` facts and context answers imply, decided in one call so the choices
 * stay mutually consistent (frontend ↔ backend ↔ hosting). The orchestrator
 * reviews them one at a time.
 */
export const StackProposal = z.array(StackDecision);
export type StackProposal = z.infer<typeof StackProposal>;

/**
 * The Phase 4 output persisted to `PhaseState.synthesisedObject` and consumed by
 * both Phase 4 renderers (`04-STACK.md`, `03-STRUCTURE.md`) and Phase 5 (M12):
 * the reviewed stack decisions plus the folder tree proposed against them.
 */
export const Phase4Output = z.object({
  decisions: z.array(StackDecision),
  structure: FolderTree,
});
export type Phase4Output = z.infer<typeof Phase4Output>;
