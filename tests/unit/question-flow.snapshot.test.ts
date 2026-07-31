import { describe, expect, it } from 'vitest';
import { phase0 } from '../../src/questions/bank/phase-0.js';
import { phase1 } from '../../src/questions/bank/phase-1.js';
import { renderQuestionFlow } from '../../src/questions/index.js';
import type { Facts, Literacy } from '../../src/questions/types.js';

const LITERACIES: Literacy[] = ['none', 'some', 'developer'];

describe('rendered question flow per literacy register', () => {
  // Phase 0 has no conditional questions — empty facts is representative.
  for (const literacy of LITERACIES) {
    it(`phase 0 — ${literacy}`, () => {
      expect(renderQuestionFlow(phase0, literacy, {})).toMatchSnapshot();
    });
  }

  // Phase 1: facts that trigger the conditional custom-rules question, so the
  // snapshot exercises the full flow including the `when`-gated editor.
  const phase1Facts: Facts = { 'manifesto.rules': 'write-my-own' };
  for (const literacy of LITERACIES) {
    it(`phase 1 — ${literacy}`, () => {
      expect(renderQuestionFlow(phase1, literacy, phase1Facts)).toMatchSnapshot();
    });
  }

  it('phase 1 hides the custom-rules editor when not requested', () => {
    const flow = renderQuestionFlow(phase1, 'none', {});
    expect(flow.questions.map((q) => q.id)).not.toContain('p1.custom-rules');
  });
});
