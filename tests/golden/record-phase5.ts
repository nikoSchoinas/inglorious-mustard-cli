import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { FakeTransport, RecordTransport } from '../../src/llm/transport.js';
import { FAKE_STEPS, FULL_5_SCRIPT, runPhase5Scripted } from './phase5-fixture.js';

/**
 * One-shot generator for Phase 5's replay fixtures (technical-plan §8, M12): the
 * `analyse` and `synthesise-architecture` passes. As with earlier phases we record the
 * SAME fixture keys from canned responses through the real record path (RecordTransport
 * over a FakeTransport) — deterministic, keyless, byte-for-byte replayable — so a later
 * real recording overwrites them at the identical paths.
 *
 * The FakeTransport steps are consumed in call order (see `FAKE_STEPS`): analyse, then
 * synthesise-architecture.
 *
 * Run with:  npx tsx tests/golden/record-phase5.ts
 */
const root = defaultFixturesRoot();
const transport = new RecordTransport(new FakeTransport(FAKE_STEPS), root);

await runPhase5Scripted({ transport, script: FULL_5_SCRIPT });
console.log(`Recorded Phase 5 analyse / synthesise-architecture fixtures to ${root}`);
