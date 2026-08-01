import type { FollowUpPolicy } from '../questions/types.js';
import type { Gap, PhaseAnalysis } from '../schemas/analysis.js';
import type { PhaseState } from '../schemas/session.js';

/**
 * The follow-up caps and ANALYSE loop guards (spec §8.1, §8.2 step 3) — the
 * "never trap the user in a loop" rules, as pure functions the runner consults.
 *
 * Two independent budgets bound the interrogation:
 *   • Follow-up questions per phase — capped by `FollowUpPolicy.maxGenerated`
 *     (default 5) and filtered to the phase's `onlySeverity` gaps.
 *   • ANALYSE runs per phase — at most 2 (`PhaseState.analysisRuns`). After the
 *     second run the phase proceeds to SYNTHESISE regardless of
 *     `readyToSynthesise`, so a stubborn analysis can never stall the user.
 *
 * Kept free of I/O and session mutation so every rule is unit-testable in
 * isolation; the runner owns the actual state transitions.
 */

/** The hard ceiling on ANALYSE runs for a single phase (§9.3 `analysisRuns` comment). */
export const MAX_ANALYSIS_RUNS = 2;

/** How many more follow-up questions this phase may ask. Never negative. */
export function remainingFollowUpBudget(policy: FollowUpPolicy, asked: number): number {
  return Math.max(0, policy.maxGenerated - asked);
}

/**
 * The follow-up questions to ask next: the analysis gaps whose severity the
 * phase's policy admits, truncated to the remaining budget. Order is preserved
 * from `analysis.gaps` so the model's own prioritisation is honoured. Pure.
 */
export function selectFollowUpGaps(
  analysis: PhaseAnalysis,
  policy: FollowUpPolicy,
  asked: number,
): Gap[] {
  const budget = remainingFollowUpBudget(policy, asked);
  if (budget === 0) {
    return [];
  }
  const admitted = analysis.gaps.filter((gap) => policy.onlySeverity.includes(gap.severity));
  return admitted.slice(0, budget);
}

/**
 * Whether a further ANALYSE run is warranted: the last analysis said it was not
 * ready to synthesise AND the loop-guard budget (max 2 runs) is not yet spent.
 */
export function shouldReanalyse(phase: PhaseState): boolean {
  return phase.analysis?.readyToSynthesise !== true && phase.analysisRuns < MAX_ANALYSIS_RUNS;
}

/**
 * Whether the phase may leave the ANALYSE/FOLLOW-UP loop for SYNTHESISE. True
 * once the analysis reports readiness OR the ANALYSE budget is exhausted — the
 * "proceed regardless, never trap the user" rule (§8.2 step 3).
 */
export function canSynthesise(phase: PhaseState): boolean {
  return phase.analysis?.readyToSynthesise === true || phase.analysisRuns >= MAX_ANALYSIS_RUNS;
}
