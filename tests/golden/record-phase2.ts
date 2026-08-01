import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { FakeTransport, RecordTransport } from '../../src/llm/transport.js';
import type { MustardSession } from '../../src/schemas/session.js';
import {
  CANNED_CAPS_MEMBER,
  CANNED_EXTRACT,
  FULL_SCRIPT,
  runPhase2AScripted,
} from './phase2a-fixture.js';

/**
 * One-shot generator for Phase 2A's replay fixtures (technical-plan §8, M8): the
 * EXTRACT pass and the per-actor suggest-capabilities pass. As with Phase 1, we record
 * the SAME fixture keys from canned responses through the real record path
 * (RecordTransport over a FakeTransport) — deterministic, keyless, byte-for-byte
 * replayable — so a later real recording overwrites them at identical paths.
 *
 * The FakeTransport steps are consumed in call order: EXTRACT first, then the Member
 * capability suggestion (Coach is removed in reflection, so it is never suggested).
 *
 * Run with:  npx tsx tests/golden/record-phase2.ts
 */
const root = defaultFixturesRoot();
const transport = new RecordTransport(
  new FakeTransport([
    { kind: 'object', value: CANNED_EXTRACT },
    { kind: 'object', value: CANNED_CAPS_MEMBER },
  ]),
  root,
);

// No disk: recording only needs the generate calls to happen, in order.
const save = (s: MustardSession): MustardSession => s;
await runPhase2AScripted({ transport, script: FULL_SCRIPT, save });
console.log(`Recorded Phase 2A extract + suggest-capabilities fixtures to ${root}`);
