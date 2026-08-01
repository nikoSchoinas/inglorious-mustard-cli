import { z } from 'zod';

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
