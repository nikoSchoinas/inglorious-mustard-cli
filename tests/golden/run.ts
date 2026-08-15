import { writeFileSync } from 'node:fs';
import { resolveApiKey } from '../../src/config/resolve.js';
import { type LLMMode, createTransport } from '../../src/llm/transport.js';
import type { GoldenBundle } from './bundle.js';
import { type GoldenScore, scoreBundle } from './judge.js';
import { runGoldenMission } from './mission.js';
import { GOLDEN_PROJECTS, PENDING_PROJECT_IDS } from './projects/index.js';
import type { GoldenProject } from './projects/types.js';
import { runRubric } from './rubric.js';

/**
 * The golden-set runner (technical-plan §5, M15) — run on demand via `pnpm golden`
 * before merging prompt edits or cutting a release (there is no scheduled CI job).
 * For each registered golden project it drives the full mission, runs the deterministic
 * rubric, calls the LLM judge, and writes a `scores.json` artifact.
 *
 * Transport mode comes from `MUSTARD_LLM_MODE`:
 *   - `fake` (default, offline): each project's canned `fakeSteps` drive the mission; the
 *     judge is skipped (no fixture), so only the deterministic rubric scores. Zero tokens.
 *   - `replay`: mission + judge read recorded fixtures. Zero tokens, still deterministic.
 *   - `record` / `real`: a real provider key is resolved and REAL tokens are spent — the
 *     mode to use before merging prompt edits, where the judge score moves.
 *
 * A hard budget cap (`MUSTARD_GOLDEN_MAX_PROJECTS`) bounds how many projects a run scores;
 * anything skipped is logged, never silently dropped (§10 "no silent caps").
 */

interface RunOptions {
  mode: string;
  maxProjects: number;
  outPath: string;
  env: NodeJS.ProcessEnv;
}

function readOptions(env: NodeJS.ProcessEnv): RunOptions {
  const rawMax = env.MUSTARD_GOLDEN_MAX_PROJECTS;
  const maxProjects = rawMax ? Math.max(1, Number.parseInt(rawMax, 10)) : GOLDEN_PROJECTS.length;
  return {
    mode: env.MUSTARD_LLM_MODE ?? 'fake',
    maxProjects,
    outPath: env.MUSTARD_GOLDEN_OUT ?? 'golden-scores.json',
    env,
  };
}

/** Score one project end to end under the chosen transport mode. */
async function scoreProject(project: GoldenProject, opts: RunOptions): Promise<GoldenScore> {
  if (opts.mode === 'fake') {
    // Offline: canned mission responses, no judge fixture → rubric-only.
    const bundle = await runGoldenMission({ project });
    const rubric = runRubric(bundle);
    return {
      projectId: project.id,
      rubric,
      rubricPassed: rubric.every((l) => l.passed),
      judge: null,
    };
  }

  const mode = opts.mode as LLMMode;
  const apiKey = await resolveKey(project, mode, opts.env);
  const missionTransport = createTransport(mode);
  const bundle: GoldenBundle = await runGoldenMission({
    project,
    transport: missionTransport,
    apiKey,
  });
  // A fresh transport for the judge so its fixtures key independently of the mission's.
  return scoreBundle({
    projectId: project.id,
    bundle,
    transport: createTransport(mode),
    config: project.config,
    apiKey,
  });
}

/** Resolve a real key for real/record modes; replay needs none. */
async function resolveKey(
  project: GoldenProject,
  mode: LLMMode,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (mode === 'replay') {
    return undefined;
  }
  const resolved = await resolveApiKey(project.config, { env });
  if (resolved.key === null) {
    throw new Error(
      `MUSTARD_LLM_MODE=${mode} needs a ${project.config.provider} key, but none was found (${resolved.source}).`,
    );
  }
  return resolved.key;
}

export async function runGoldenSet(env: NodeJS.ProcessEnv = process.env): Promise<GoldenScore[]> {
  const opts = readOptions(env);
  const selected = GOLDEN_PROJECTS.slice(0, opts.maxProjects);
  const skipped = GOLDEN_PROJECTS.slice(opts.maxProjects).map((p) => p.id);

  console.log(
    `[golden] mode=${opts.mode} scoring ${selected.length}/${GOLDEN_PROJECTS.length} projects`,
  );
  if (skipped.length > 0) {
    console.log(`[golden] budget cap skipped: ${skipped.join(', ')}`);
  }
  if (PENDING_PROJECT_IDS.length > 0) {
    console.log(`[golden] ${PENDING_PROJECT_IDS.length} projects not yet authored (§5 follow-on).`);
  }

  const scores: GoldenScore[] = [];
  for (const project of selected) {
    const score = await scoreProject(project, opts);
    const judgeAvg = score.judge ? averageJudge(score.judge) : null;
    console.log(
      `[golden] ${project.id}: rubric=${score.rubricPassed ? 'pass' : 'FAIL'}${judgeAvg === null ? '' : ` judge=${judgeAvg.toFixed(1)}/10`}`,
    );
    scores.push(score);
  }

  const report = {
    mode: opts.mode,
    generatedAt: new Date().toISOString(),
    projects: scores,
  };
  writeFileSync(opts.outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[golden] wrote ${opts.outPath}`);
  return scores;
}

/** Mean of the six numeric judge dimensions, for a one-line summary. */
function averageJudge(judge: NonNullable<GoldenScore['judge']>): number {
  const dims = [
    judge.manifestoQuality,
    judge.aiLawsClarity,
    judge.useCaseDepth,
    judge.stackAlignment,
    judge.architectureCompleteness,
    judge.taskSpecificity,
  ];
  return dims.reduce((a, b) => a + b, 0) / dims.length;
}

// Run when invoked directly (`tsx tests/golden/run.ts`), not when imported by a test.
if (process.argv[1]?.endsWith('run.ts')) {
  runGoldenSet().then(
    (scores) => process.exit(scores.every((s) => s.rubricPassed) ? 0 : 1),
    (err) => {
      console.error('[golden] run failed:', err);
      process.exit(1);
    },
  );
}
