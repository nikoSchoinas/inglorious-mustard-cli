import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/commands/init.js';
import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import { FakeTransport, RecordTransport } from '../../src/llm/transport.js';
import { CANNED_ANALYSE, CANNED_MANIFESTO, FULL_SCRIPT, skeletonDeps } from './phase1-skeleton.js';

/**
 * One-shot generator for golden project #1's replay fixtures (technical-plan §8).
 *
 * With a real provider key this milestone records against Anthropic. In its absence
 * we record the SAME fixture keys from canned responses through the real record
 * path (RecordTransport over a FakeTransport): deterministic, keyless, and byte-for-
 * byte replayable. A later real Anthropic recording overwrites these at the exact
 * same paths (identical pass/promptVersion/schema/input), so nothing else changes.
 *
 * Run with:  npx tsx tests/golden/record.ts
 */
const cwd = mkdtempSync(join(tmpdir(), 'mustard-record-'));
const root = defaultFixturesRoot();
const transport = new RecordTransport(
  new FakeTransport([
    { kind: 'object', value: CANNED_ANALYSE },
    { kind: 'object', value: CANNED_MANIFESTO },
  ]),
  root,
);

const { deps } = skeletonDeps({ cwd, transport, script: FULL_SCRIPT });
await runInit(deps);
console.log(`Recorded Phase 1 analyse + synthesise-manifesto fixtures to ${root}`);
