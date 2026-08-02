import { describe, expect, it } from 'vitest';
import { FakeTransport } from '../../src/llm/transport.js';
import { JudgeScores } from '../../src/schemas/judge.js';
import { scoreBundle } from '../golden/judge.js';
import { runGoldenMission } from '../golden/mission.js';
import { habitTracker } from '../golden/projects/01-habit-tracker.js';

/**
 * M15 judge wiring proved OFFLINE (technical-plan §5). A full mission produces a bundle;
 * the judge pass — a `generateObject` call — returns a schema-valid `JudgeScores` over a
 * FakeTransport, merged with the deterministic rubric into one `GoldenScore`. No tokens:
 * the real-provider judging is exercised only by the nightly job.
 */
describe('golden judge — habit tracker (project #1)', () => {
  it('merges the deterministic rubric with schema-valid judge scores', async () => {
    const bundle = await runGoldenMission({ project: habitTracker });

    const cannedJudge = {
      manifestoQuality: 8,
      aiLawsClarity: 7,
      useCaseDepth: 9,
      stackAlignment: 8,
      architectureCompleteness: 7,
      taskSpecificity: 8,
      contradictions: [],
      vagueRules: [],
    };

    const score = await scoreBundle({
      projectId: habitTracker.id,
      bundle,
      transport: new FakeTransport([{ kind: 'object', value: cannedJudge }]),
    });

    // Deterministic rubric merged and clean.
    expect(score.rubricPassed).toBe(true);
    expect(score.rubric.every((l) => l.passed)).toBe(true);

    // The judge emitted a schema-valid object.
    expect(score.judge).not.toBeNull();
    expect(() => JudgeScores.parse(score.judge)).not.toThrow();
    expect(score.judge?.useCaseDepth).toBe(9);
  });

  it('records a null judge when the pass degrades', async () => {
    const bundle = await runGoldenMission({ project: habitTracker });
    // A malformed judge response degrades after the client's retry.
    const score = await scoreBundle({
      projectId: habitTracker.id,
      bundle,
      transport: new FakeTransport([
        { kind: 'object', value: { not: 'a valid judge object' } },
        { kind: 'object', value: { still: 'invalid' } },
      ]),
    });
    expect(score.judge).toBeNull();
    // The deterministic rubric is unaffected by a judge failure.
    expect(score.rubricPassed).toBe(true);
  });
});
