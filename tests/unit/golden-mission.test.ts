import { describe, expect, it } from 'vitest';
import { runGoldenMission } from '../golden/mission.js';
import { habitTracker } from '../golden/projects/01-habit-tracker.js';
import { runRubric } from '../golden/rubric.js';

/**
 * M15 integration proof (technical-plan §5): golden project #1 driven through the full
 * seven-phase mission offline (FakeTransport), producing a complete bundle that passes
 * every deterministic rubric line. This is the template every later golden project extends.
 */
describe('golden mission — habit tracker (project #1)', () => {
  it('runs Phase 0→7 and produces a rubric-clean bundle', async () => {
    const bundle = await runGoldenMission({ project: habitTracker });

    // The mission completed: every phase accepted, currentPhase past the last.
    expect(bundle.session.currentPhase).toBe(8);

    // The full artifact set is on disk.
    for (const name of [
      '00-BRIEFING.md',
      '01-MANIFESTO.md',
      '01-AI-LAWS.md',
      '02-USE-CASES.md',
      '03-SCHEMAS.md',
      '03-STRUCTURE.md',
      '04-STACK.md',
      '05-ARCHITECTURE.md',
      '05-DECISIONS.md',
      '06-ROADMAP.md',
    ]) {
      expect(bundle.artifacts[name], `missing ${name}`).toBeDefined();
    }

    // Every deterministic rubric line passes.
    const lines = runRubric(bundle);
    for (const line of lines) {
      expect(line, `${line.id}: ${line.detail}`).toMatchObject({ passed: true });
    }
  });
});
