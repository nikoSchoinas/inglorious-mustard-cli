import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { FakeTransport, RecordTransport } from '../../src/llm/transport.js';
import { FAKE_STEPS, FULL_2B_SCRIPT, runPhase2BScripted } from './phase2b-fixture.js';

/**
 * One-shot generator for Phase 2B's replay fixtures (technical-plan §8, M9): the
 * happy-path, failure-questions, failure-structure and order-use-cases passes. As
 * with earlier phases we record the SAME fixture keys from canned responses through
 * the real record path (RecordTransport over a FakeTransport) — deterministic,
 * keyless, byte-for-byte replayable — so a later real recording overwrites them at
 * identical paths.
 *
 * The FakeTransport steps are consumed in call order (see `FAKE_STEPS`): the three
 * happy paths, then per use case failure-questions → failure-structure, then order.
 *
 * Run with:  npx tsx tests/golden/record-phase2b.ts
 */
const root = defaultFixturesRoot();
const transport = new RecordTransport(new FakeTransport(FAKE_STEPS), root);

await runPhase2BScripted({ transport, script: FULL_2B_SCRIPT });
console.log(`Recorded Phase 2B happy-path/failure/order fixtures to ${root}`);
