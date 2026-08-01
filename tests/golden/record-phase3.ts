import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { FakeTransport, RecordTransport } from '../../src/llm/transport.js';
import { FAKE_STEPS, FULL_3_SCRIPT, runPhase3Scripted } from './phase3-fixture.js';

/**
 * One-shot generator for Phase 3's replay fixture (technical-plan §8, M10): the
 * `propose-enum-values` pass. As with earlier phases we record the SAME fixture key from
 * a canned response through the real record path (RecordTransport over a FakeTransport) —
 * deterministic, keyless, byte-for-byte replayable — so a later real recording overwrites
 * it at the identical path.
 *
 * The FakeTransport step is consumed in call order (see `FAKE_STEPS`): one enum proposal
 * for `Habit.status`.
 *
 * Run with:  npx tsx tests/golden/record-phase3.ts
 */
const root = defaultFixturesRoot();
const transport = new RecordTransport(new FakeTransport(FAKE_STEPS), root);

await runPhase3Scripted({ transport, script: FULL_3_SCRIPT });
console.log(`Recorded Phase 3 propose-enum-values fixtures to ${root}`);
