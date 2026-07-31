import { z } from 'zod';

/**
 * The ANALYSE pass contract (spec §9.3). One `Gap` is a single missing or
 * ambiguous piece of information the fast model flagged for a follow-up.
 */
export const Gap = z.object({
  id: z.string(),
  severity: z.enum(['blocking', 'important', 'good_to_know']),
  description: z.string(),
  suggestedQuestion: z.string(),
  suggestedType: z.enum(['select', 'multiselect', 'text', 'editor', 'confirm']),
  suggestedOptions: z.array(z.string()).optional(),
});
export type Gap = z.infer<typeof Gap>;

/**
 * Output of the ANALYSE pass: the typed critique of the answers so far.
 * `readyToSynthesise` gates the per-phase state machine (§8.2).
 */
export const PhaseAnalysis = z.object({
  gaps: z.array(Gap),
  contradictions: z.array(
    z.object({
      description: z.string(),
      answerIds: z.array(z.string()),
    }),
  ),
  derivedFacts: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
      rationale: z.string(),
    }),
  ),
  readyToSynthesise: z.boolean(),
});
export type PhaseAnalysis = z.infer<typeof PhaseAnalysis>;
