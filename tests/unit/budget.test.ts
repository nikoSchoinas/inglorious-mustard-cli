import { describe, expect, it } from 'vitest';
import {
  MAX_ANALYSIS_RUNS,
  canSynthesise,
  remainingFollowUpBudget,
  selectFollowUpGaps,
  shouldReanalyse,
} from '../../src/engine/budget.js';
import type { FollowUpPolicy } from '../../src/questions/types.js';
import type { Gap, PhaseAnalysis } from '../../src/schemas/analysis.js';
import type { PhaseState } from '../../src/schemas/session.js';

const POLICY: FollowUpPolicy = { maxGenerated: 5, onlySeverity: ['blocking', 'important'] };

function gap(id: string, severity: Gap['severity']): Gap {
  return {
    id,
    severity,
    description: `desc ${id}`,
    suggestedQuestion: `q ${id}?`,
    suggestedType: 'text',
  };
}

function analysis(overrides: Partial<PhaseAnalysis> = {}): PhaseAnalysis {
  return {
    gaps: [],
    contradictions: [],
    derivedFacts: [],
    readyToSynthesise: false,
    ...overrides,
  };
}

function phaseState(overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    id: 1,
    status: 'in_progress',
    answers: [],
    followUpsAsked: 0,
    analysisRuns: 0,
    artifactPaths: [],
    edited: false,
    ...overrides,
  };
}

describe('remainingFollowUpBudget', () => {
  it('returns the unspent budget', () => {
    expect(remainingFollowUpBudget(POLICY, 0)).toBe(5);
    expect(remainingFollowUpBudget(POLICY, 3)).toBe(2);
  });

  it('never goes negative when over-asked', () => {
    expect(remainingFollowUpBudget(POLICY, 7)).toBe(0);
  });
});

describe('selectFollowUpGaps', () => {
  it('keeps only gaps whose severity the policy admits, preserving order', () => {
    const a = analysis({
      gaps: [
        gap('g1', 'good_to_know'),
        gap('g2', 'blocking'),
        gap('g3', 'important'),
        gap('g4', 'good_to_know'),
      ],
    });
    expect(selectFollowUpGaps(a, POLICY, 0).map((g) => g.id)).toEqual(['g2', 'g3']);
  });

  it('truncates to the remaining budget', () => {
    const a = analysis({
      gaps: [gap('g1', 'blocking'), gap('g2', 'blocking'), gap('g3', 'important')],
    });
    // Two already asked → only one slot left.
    expect(selectFollowUpGaps(a, POLICY, 4).map((g) => g.id)).toEqual(['g1']);
  });

  it('returns nothing once the budget is spent', () => {
    const a = analysis({ gaps: [gap('g1', 'blocking')] });
    expect(selectFollowUpGaps(a, POLICY, 5)).toEqual([]);
  });
});

describe('shouldReanalyse', () => {
  it('is true when not ready and the run budget remains', () => {
    expect(
      shouldReanalyse(
        phaseState({ analysis: analysis({ readyToSynthesise: false }), analysisRuns: 1 }),
      ),
    ).toBe(true);
  });

  it('is false once the run budget is spent', () => {
    expect(
      shouldReanalyse(
        phaseState({
          analysis: analysis({ readyToSynthesise: false }),
          analysisRuns: MAX_ANALYSIS_RUNS,
        }),
      ),
    ).toBe(false);
  });

  it('is false when the analysis reports readiness', () => {
    expect(
      shouldReanalyse(
        phaseState({ analysis: analysis({ readyToSynthesise: true }), analysisRuns: 1 }),
      ),
    ).toBe(false);
  });
});

describe('canSynthesise', () => {
  it('is true when the analysis reports readiness', () => {
    expect(canSynthesise(phaseState({ analysis: analysis({ readyToSynthesise: true }) }))).toBe(
      true,
    );
  });

  it('is true once the ANALYSE budget is exhausted, even if not ready (never trap the user)', () => {
    expect(
      canSynthesise(
        phaseState({
          analysis: analysis({ readyToSynthesise: false }),
          analysisRuns: MAX_ANALYSIS_RUNS,
        }),
      ),
    ).toBe(true);
  });

  it('is false while not ready and the budget remains', () => {
    expect(
      canSynthesise(
        phaseState({ analysis: analysis({ readyToSynthesise: false }), analysisRuns: 1 }),
      ),
    ).toBe(false);
  });
});
