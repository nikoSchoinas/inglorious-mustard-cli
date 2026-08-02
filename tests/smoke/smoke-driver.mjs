// M16 release-hardening smoke driver (technical-plan §5).
//
// Runs the FULL seven-phase habit-tracker mission against the engine as shipped in the
// PUBLISHED tarball — imported here from the *installed* `inglorious-mustard` package, not
// from source. If the packed `dist/` is missing a file or an import path is broken, this
// fails at load time; if the engine regressed, it fails at the artifact assertions. Zero
// tokens: every LLM pass is served by a FakeTransport over canned responses, so the run is
// deterministic and needs no key and no network.
//
// The habit-tracker script + canned responses arrive as JSON (see serialize-mission.ts),
// which is the only test data the clean install has — the engine itself is the package.

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deep imports into the installed package. package.json ships no `exports` map on purpose
// (technical-plan §5), so these resolve to node_modules/inglorious-mustard/dist/*.
import { driveMission } from 'inglorious-mustard/dist/commands/drive.js';
import { buildPasses } from 'inglorious-mustard/dist/llm/passes/index.js';
import { FakeTransport } from 'inglorious-mustard/dist/llm/transport.js';
import { ScriptedPrompter } from 'inglorious-mustard/dist/ui/scripted-prompter.js';

const here = dirname(fileURLToPath(import.meta.url));
const mission = JSON.parse(readFileSync(join(here, 'habit-tracker.mission.json'), 'utf8'));

/** A minimal valid session at the very start of Phase 0 (mirrors tests/golden/mission.ts). */
function freshSession(now) {
  const ts = now();
  return {
    schemaVersion: 1,
    projectName: '',
    literacy: 'none',
    agentTarget: 'undecided',
    currentPhase: 0,
    phases: [],
    facts: {},
    factSources: {},
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

async function main() {
  const cwd = mkdtempSync(join(tmpdir(), 'mustard-smoke-'));
  const now = () => new Date().toISOString();
  const transport = new FakeTransport(mission.fakeSteps);

  try {
    await driveMission(freshSession(now), {
      prompter: new ScriptedPrompter(mission.script),
      cwd,
      now,
      installCancel: false,
      // Skip the 0.5 key/connectivity step with the project's fixed config + a dummy key.
      setup: async () => ({ config: mission.config, apiKey: 'dummy' }),
      // Route every LLM pass through the canned FakeTransport — zero tokens.
      buildPasses: (config, o) => buildPasses(config, { ...o, transport }),
    });

    const problems = [];

    for (const rel of mission.expectedArtifacts) {
      const p = join(cwd, rel);
      let size = -1;
      try {
        size = statSync(p).size;
      } catch {
        size = -1;
      }
      if (size < 0) problems.push(`missing: ${rel}`);
      else if (size === 0) problems.push(`empty: ${rel}`);
    }

    const promptsDir = join(cwd, mission.promptsDir);
    let prompts = [];
    try {
      prompts = readdirSync(promptsDir).filter((f) => f.endsWith('.md'));
    } catch {
      /* handled below */
    }
    if (prompts.length < mission.minPrompts) {
      problems.push(
        `expected >= ${mission.minPrompts} prompt card(s) in ${mission.promptsDir}, found ${prompts.length}`,
      );
    }

    if (problems.length > 0) {
      console.error('[smoke] FAILED — the packed CLI ran but the bundle is incomplete:');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }

    console.log(
      `[smoke] OK — full mission produced ${mission.expectedArtifacts.length} artifacts + ${prompts.length} prompt card(s) from the installed tarball.`,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED — the packed CLI threw:');
  console.error(err);
  process.exit(1);
});
