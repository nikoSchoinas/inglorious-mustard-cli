import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { FakeTransport, RecordTransport } from '../../src/llm/transport.js';
import { runGoldenMission } from './mission.js';
import { GOLDEN_PROJECTS } from './projects/index.js';

/**
 * One-shot full-mission fixture recorder (technical-plan §5, M15). Drives every registered
 * golden project through the WHOLE seven-phase mission, recording each LLM pass's response
 * at its real fixture key `(pass, promptVersion, schemaHash, inputHash)` so a later
 * `MUSTARD_LLM_MODE=replay` run of the mission is deterministic and token-free.
 *
 * Like `record.ts`, it records the canonical canned responses through the real record path
 * (RecordTransport over FakeTransport) — keyless and deterministic. A later real-provider
 * recording overwrites the same paths. The LLM JUDGE is not recorded here: judging is only
 * meaningful against a real provider, so its fixtures are captured during a real run.
 *
 * Run with:  npx tsx tests/golden/record-mission.ts
 */
const root = defaultFixturesRoot();

for (const project of GOLDEN_PROJECTS) {
  const transport = new RecordTransport(new FakeTransport(project.fakeSteps), root);
  await runGoldenMission({ project, transport });
  console.log(`[record-mission] recorded full-mission fixtures for ${project.id}`);
}

console.log(`[record-mission] fixtures written to ${root}`);
