import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { habitTracker } from '../golden/projects/01-habit-tracker.js';

/**
 * Serialize the habit-tracker golden mission into a self-contained JSON the M16 Docker
 * smoke test (`smoke-driver.mjs`) can drive from a *clean install* of the published
 * tarball (technical-plan §5, M16). The golden project module imports runtime values from
 * across the `tests/golden` tree — which in turn imports from `src/` — so it can't be
 * loaded inside a package that ships `dist/` only. Its answer script and canned LLM
 * responses are plain data, though, so we flatten them to JSON here (under `tsx`, in the
 * repo) and let the driver replay them against the shipped engine.
 *
 * The smoke test is the "offline engine driver" the user chose: zero tokens, no fixtures
 * shipped, package stays `dist`-only.
 */

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'habit-tracker.mission.json');

/** Files the full seven-phase mission must produce (rubric-style presence check). */
const EXPECTED_ARTIFACTS = [
  'mustard/00-BRIEFING.md',
  'mustard/01-MANIFESTO.md',
  'mustard/01-AI-LAWS.md',
  'mustard/02-USE-CASES.md',
  'mustard/03-SCHEMAS.md',
  'mustard/03-STRUCTURE.md',
  'mustard/04-STACK.md',
  'mustard/05-ARCHITECTURE.md',
  'mustard/05-DECISIONS.md',
  'mustard/06-ROADMAP.md',
  'mustard/.session.json',
];

function main(): void {
  // The happy-path mission uses only successful (`object`) responses. An `error` step
  // carries an Error instance that won't survive JSON — fail loudly rather than emit a
  // fixture the driver would silently mis-replay.
  const badStep = habitTracker.fakeSteps.findIndex((s) => s.kind !== 'object');
  if (badStep !== -1) {
    throw new Error(
      `Cannot serialize habit-tracker mission: fakeSteps[${badStep}] is a non-object step; the smoke driver only replays successful responses.`,
    );
  }

  const mission = {
    id: habitTracker.id,
    config: habitTracker.config,
    script: habitTracker.script,
    // Narrow to the serializable shape the driver expects.
    fakeSteps: habitTracker.fakeSteps.map((s) => ({
      kind: 'object',
      value: (s as { value: unknown }).value,
    })),
    expectedArtifacts: EXPECTED_ARTIFACTS,
    promptsDir: 'mustard/07-PROMPTS',
    minPrompts: 1,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(mission, null, 2)}\n`, 'utf8');
  console.log(
    `[smoke] wrote ${OUT} (${mission.script.length} script steps, ${mission.fakeSteps.length} fake steps)`,
  );
}

main();
