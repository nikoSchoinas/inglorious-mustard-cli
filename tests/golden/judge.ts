import { LLMClient } from '../../src/llm/client.js';
import { type JudgeFn, createJudge } from '../../src/llm/passes/judge.js';
import { createModelForTier } from '../../src/llm/router.js';
import type { LLMTransport } from '../../src/llm/transport.js';
import type { MustardConfig } from '../../src/schemas/config.js';
import type { JudgeScores } from '../../src/schemas/judge.js';
import type { GoldenBundle } from './bundle.js';
import { CONFIG } from './phase1-skeleton.js';
import { type RubricLine, runRubric } from './rubric.js';

/**
 * Score one golden bundle (technical-plan §5, M15): the deterministic rubric (code
 * assertions, offline) PLUS the LLM judge (soft quality, real tokens nightly). Kept out of
 * the production `Passes` on purpose — the judge is a test-harness pass, wired here over a
 * caller-supplied transport (fake/replay offline, real nightly).
 */
export interface GoldenScore {
  projectId: string;
  /** The deterministic rubric lines and whether they all held. */
  rubric: RubricLine[];
  rubricPassed: boolean;
  /** The LLM judge's soft scores, or null if the pass degraded. */
  judge: JudgeScores | null;
}

export interface ScoreBundleOptions {
  projectId: string;
  bundle: GoldenBundle;
  transport: LLMTransport;
  /** Provider/model ids for the judge model. Defaults to the test config (anthropic). */
  config?: MustardConfig;
  /** Optional resolved provider key (real/record transports); omit for fake/replay. */
  apiKey?: string;
}

/** Build the standalone judge pass over a transport (never part of the mission `Passes`). */
export function buildJudge(opts: {
  transport: LLMTransport;
  config?: MustardConfig;
  apiKey?: string;
}): JudgeFn {
  const client = new LLMClient({ transport: opts.transport });
  const model = createModelForTier(
    opts.config ?? CONFIG,
    'deep',
    opts.apiKey ? { apiKey: opts.apiKey } : {},
  );
  return createJudge({ client, model });
}

export async function scoreBundle(opts: ScoreBundleOptions): Promise<GoldenScore> {
  const rubric = runRubric(opts.bundle);
  const rubricPassed = rubric.every((line) => line.passed);

  const judgeFn = buildJudge({
    transport: opts.transport,
    config: opts.config,
    apiKey: opts.apiKey,
  });
  const outcome = await judgeFn({
    description: describeProject(opts.bundle),
    artifacts: opts.bundle.artifacts,
    facts: opts.bundle.session.facts,
  });

  return {
    projectId: opts.projectId,
    rubric,
    rubricPassed,
    judge: outcome.status === 'ok' ? outcome.value : null,
  };
}

/** The project description handed to the judge: the raw Phase 2 capture, if present. */
function describeProject(bundle: GoldenBundle): string {
  const phase2 = bundle.session.phases.find((p) => p.id === 2);
  const capture = phase2?.answers.find((a) => a.questionId === 'p2.capture')?.value;
  return typeof capture === 'string' ? capture : bundle.session.projectName;
}
