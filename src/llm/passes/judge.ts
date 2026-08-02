import type { LanguageModel } from 'ai';
import { JudgeScores } from '../../schemas/judge.js';
import type { LLMClient, LlmOutcome } from '../client.js';
import { judgePrompt } from '../prompts/judge.js';

/**
 * The golden-set LLM judge pass (spec §10, technical-plan §5, M15). A single deep-tier
 * `generateObject` call scoring a complete bundle's SOFT quality (the deterministic rubric
 * owns the mechanical checks). Deliberately NOT part of the production `Passes` a real
 * mission builds — it is a test-harness pass, constructed standalone by `tests/golden/judge.ts`
 * so it never appears in the interrogation the user runs.
 *
 * The input is a stable projection (sorted artifact names and fact keys) so record and
 * replay compute one fixture key; `judgePrompt.version` flows into that key, so editing the
 * judge prompt invalidates its fixtures loudly.
 */
export interface JudgeInput {
  /** The project description (the Phase 2 capture) for grounding. */
  description: string;
  /** Artifact file name → rendered markdown. */
  artifacts: Record<string, string>;
  /** Derived `needs.*`/`context.*` facts, for stack/architecture grounding. */
  facts: Record<string, unknown>;
}

export type JudgeFn = (input: JudgeInput) => Promise<LlmOutcome<JudgeScores>>;

export interface JudgeDeps {
  client: LLMClient;
  /** The deep-tier model handle — the judge reads the whole bundle. */
  model: LanguageModel;
}

/** Sort an object's entries by key into a fresh record (stable for hashing). */
function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key] as T;
  }
  return out;
}

export function createJudge(deps: JudgeDeps): JudgeFn {
  return async (input) => {
    const stable = {
      description: input.description,
      artifacts: sortRecord(input.artifacts),
      facts: sortRecord(input.facts),
    };
    return deps.client.generate({
      pass: 'judge',
      tier: 'deep',
      system: judgePrompt,
      input: stable,
      prompt: `Score this planning bundle:\n\n${JSON.stringify(stable, null, 2)}`,
      schema: JudgeScores,
      model: deps.model,
    });
  };
}
