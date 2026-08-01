import { describe, expect, it } from 'vitest';
import { phase0 } from '../../src/questions/bank/phase-0.js';
import { phase1 } from '../../src/questions/bank/phase-1.js';
import { phase2 } from '../../src/questions/bank/phase-2.js';
import { phase3 } from '../../src/questions/bank/phase-3.js';
import { phase4 } from '../../src/questions/bank/phase-4.js';
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
  const phase1Facts: Facts = { 'manifesto.rules': ['write-my-own'] };
  for (const literacy of LITERACIES) {
    it(`phase 1 — ${literacy}`, () => {
      expect(renderQuestionFlow(phase1, literacy, phase1Facts)).toMatchSnapshot();
    });
  }

  it('phase 1 hides the custom-rules editor when not requested', () => {
    const flow = renderQuestionFlow(phase1, 'none', {});
    expect(flow.questions.map((q) => q.id)).not.toContain('p1.custom-rules');
  });

  it('phase 1 shows the custom-rules editor when write-my-own is among the selected rules', () => {
    const facts: Facts = { 'manifesto.rules': ['ship-before-perfect', 'write-my-own'] };
    const flow = renderQuestionFlow(phase1, 'none', facts);
    expect(flow.questions.map((q) => q.id)).toContain('p1.custom-rules');
  });

  it('phase 1 hides the custom-rules editor when other rules are selected without it', () => {
    const facts: Facts = { 'manifesto.rules': ['ship-before-perfect'] };
    const flow = renderQuestionFlow(phase1, 'none', facts);
    expect(flow.questions.map((q) => q.id)).not.toContain('p1.custom-rules');
  });

  // Phase 2 has a single unconditional seed question (the raw capture); the rest of
  // the phase is bespoke flow, not bank questions.
  for (const literacy of LITERACIES) {
    it(`phase 2 — ${literacy}`, () => {
      expect(renderQuestionFlow(phase2, literacy, {})).toMatchSnapshot();
    });
  }

  // Phase 3 is translation mode: a single global retention select is its only bank
  // question (cardinality disambiguation and enum discovery are bespoke runtime flow).
  for (const literacy of LITERACIES) {
    it(`phase 3 — ${literacy}`, () => {
      expect(renderQuestionFlow(phase3, literacy, {})).toMatchSnapshot();
    });
  }

  // Phase 4 is proposal mode: the ten business questions + four context selects are all
  // bank questions. `actorCount > 1` so the conditional `p4.concurrent` question shows.
  const phase4Facts: Facts = { actorCount: 2 };
  for (const literacy of LITERACIES) {
    it(`phase 4 — ${literacy}`, () => {
      expect(renderQuestionFlow(phase4, literacy, phase4Facts)).toMatchSnapshot();
    });
  }

  it('phase 4 hides the concurrency question for a single-actor product', () => {
    const flow = renderQuestionFlow(phase4, 'none', { actorCount: 1 });
    expect(flow.questions.map((q) => q.id)).not.toContain('p4.concurrent');
  });

  it('phase 4 shows the concurrency question when more than one actor exists', () => {
    const flow = renderQuestionFlow(phase4, 'none', { actorCount: 2 });
    expect(flow.questions.map((q) => q.id)).toContain('p4.concurrent');
  });
});
