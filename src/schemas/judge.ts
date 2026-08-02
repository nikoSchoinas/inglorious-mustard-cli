import { z } from 'zod';

/**
 * The LLM-judge score contract (spec §10, technical-plan §5, M15). The judge reads a
 * complete planning bundle and scores the SOFT dimensions no deterministic assertion can
 * decide — quality, contradictions, vague rules. The mechanical rubric lines (actor
 * coverage, failure-path coverage, topological validity, needs→stack, AI-LAWS line cap)
 * are code assertions in `tests/golden/rubric.ts`, NOT the judge's job (§10: "reserve the
 * judge for quality, contradiction and vagueness scoring").
 *
 * This is a test-harness schema, not a frozen product contract: it is the output shape of
 * a `generateObject` call made only by the golden harness (offline replay + nightly real).
 */

/** A 0–10 quality score for one bundle dimension. */
const Score = z.number().int().min(0).max(10);

export const JudgeScores = z.object({
  /** Is the manifesto specific to THIS product, or generic boilerplate? */
  manifestoQuality: Score,
  /** Are the AI-LAWS actionable in a code review, or vague aspirations? */
  aiLawsClarity: Score,
  /** Are the use cases and their failure paths realistic and thorough? */
  useCaseDepth: Score,
  /** Do the stack choices genuinely fit the stated needs and scale? */
  stackAlignment: Score,
  /** Do the architecture + ADRs explain the non-obvious, irreversible choices? */
  architectureCompleteness: Score,
  /** Are task acceptance criteria testable and appropriately sized? */
  taskSpecificity: Score,
  /** Plain-language contradictions found ACROSS artifacts (empty if none). */
  contradictions: z.array(z.string()),
  /** AI-LAWS or manifesto rules too vague to enforce (empty if none). */
  vagueRules: z.array(z.string()),
});
export type JudgeScores = z.infer<typeof JudgeScores>;
