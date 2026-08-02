import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CommandDeps, driveMission } from '../../src/commands/drive.js';
import { buildPasses } from '../../src/llm/passes/index.js';
import { FakeTransport, type LLMTransport } from '../../src/llm/transport.js';
import type { MustardSession } from '../../src/schemas/session.js';
import { ScriptedPrompter } from '../../src/ui/scripted-prompter.js';
import type { GoldenBundle } from './bundle.js';
import { CLOCK } from './phase1-skeleton.js';
import type { GoldenProject } from './projects/types.js';

/**
 * Drive a golden project through the FULL seven-phase mission (technical-plan §5, M15)
 * and return the scored bundle: the final session plus every rendered artifact. This is
 * the integration surface the per-phase fixtures never exercised — one cumulative
 * `driveMission` run with the REAL phase orchestrators (2A/2B/3/4/5/6/7 are not stubbed).
 *
 * Offline (the default) the mission runs against a `FakeTransport` seeded with the
 * project's canned responses in pass-call order — deterministic, zero tokens. Nightly,
 * a real transport is injected instead so genuine model output flows and the judge score
 * reflects the current prompts. Everything is written under a throwaway temp `cwd`
 * (artifacts, `.session.json`, and the Phase 7 repo-root adapter), read back, then removed.
 */
export interface RunGoldenMissionOptions {
  project: GoldenProject;
  /** Transport override. Defaults to a FakeTransport over `project.fakeSteps` (offline). */
  transport?: LLMTransport;
  /** Resolved provider key for real/record transports. Defaults to a dummy (fake/replay). */
  apiKey?: string;
}

export async function runGoldenMission(opts: RunGoldenMissionOptions): Promise<GoldenBundle> {
  const { project } = opts;
  const transport = opts.transport ?? new FakeTransport(project.fakeSteps);
  const apiKey = opts.apiKey ?? 'dummy';
  const cwd = mkdtempSync(join(tmpdir(), 'mustard-golden-'));

  try {
    const prompter = new ScriptedPrompter(project.script);
    const deps: CommandDeps = {
      prompter,
      cwd,
      now: CLOCK,
      installCancel: false,
      // Bypass the 0.5 key/connectivity step with the project's fixed config.
      setup: async () => ({ config: project.config, apiKey }),
      // Route every LLM pass through the caller's transport (fake or real).
      buildPasses: (config, o) => buildPasses(config, { ...o, transport }),
    };

    const session = await driveMission(freshSession(), deps);
    const artifacts = readArtifacts(cwd);
    return { session, artifacts };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** A minimal valid session at the very start of Phase 0 (mirrors `init.ts`). */
function freshSession(): MustardSession {
  const ts = CLOCK();
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

/** Read every rendered markdown artifact under `<cwd>/mustard/` (recursing 07-PROMPTS/). */
function readArtifacts(cwd: string): Record<string, string> {
  const root = join(cwd, 'mustard');
  const out: Record<string, string> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), rel);
      } else if (entry.name.endsWith('.md')) {
        out[rel] = readFileSync(join(dir, entry.name), 'utf8');
      }
    }
  };
  walk(root, '');
  return out;
}
