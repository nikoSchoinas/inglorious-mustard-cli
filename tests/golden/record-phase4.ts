import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { FakeTransport, RecordTransport } from '../../src/llm/transport.js';
import { FAKE_STEPS, FULL_4_SCRIPT, runPhase4Scripted } from './phase4-fixture.js';

/**
 * One-shot generator for Phase 4's replay fixtures (technical-plan §8, M11): the
 * `propose-stack`, `explain-stack`, and `propose-structure` passes. As with earlier
 * phases we record the SAME fixture keys from canned responses through the real record
 * path (RecordTransport over a FakeTransport) — deterministic, keyless, byte-for-byte
 * replayable — so a later real recording overwrites them at the identical paths.
 *
 * The FakeTransport steps are consumed in call order (see `FAKE_STEPS`): propose-stack,
 * then one explain-stack (decision 0), then propose-structure.
 *
 * Run with:  npx tsx tests/golden/record-phase4.ts
 */
const root = defaultFixturesRoot();
const transport = new RecordTransport(new FakeTransport(FAKE_STEPS), root);

await runPhase4Scripted({ transport, script: FULL_4_SCRIPT });
console.log(
  `Recorded Phase 4 propose-stack / explain-stack / propose-structure fixtures to ${root}`,
);
