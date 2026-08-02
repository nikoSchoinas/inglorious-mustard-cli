import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { FakeTransport, RecordTransport } from '../../src/llm/transport.js';
import { FAKE_STEPS, FULL_6_SCRIPT, runPhase6Scripted } from './phase6-fixture.js';

/**
 * One-shot generator for Phase 6's replay fixtures (technical-plan §8, M13): the
 * `analyse` and `sequence` passes. As with earlier phases we record the SAME fixture
 * keys from canned responses through the real record path (RecordTransport over a
 * FakeTransport) — deterministic, keyless, byte-for-byte replayable — so a later real
 * recording overwrites them at the identical paths.
 *
 * The FakeTransport steps are consumed in call order (see `FAKE_STEPS`): analyse, then
 * sequence.
 *
 * Run with:  npx tsx tests/golden/record-phase6.ts
 */
const root = defaultFixturesRoot();
const transport = new RecordTransport(new FakeTransport(FAKE_STEPS), root);

await runPhase6Scripted({ transport, script: FULL_6_SCRIPT });
console.log(`Recorded Phase 6 analyse / sequence fixtures to ${root}`);
