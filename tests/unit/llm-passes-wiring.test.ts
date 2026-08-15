import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';
import type { GenerateArgs, LLMClient, LlmOutcome } from '../../src/llm/client.js';
import { createAnalyse } from '../../src/llm/passes/analyse.js';
import type { Phase } from '../../src/questions/types.js';
import { makeSession } from './fixtures.js';

/**
 * Guards the deep-everywhere model contract: every LLM call runs on the deep
 * model, so every call site must declare `tier: 'deep'` — the tier drives the
 * timeout, and a `'fast'` tier would give the slower deep model only 60s.
 * (The fast tier was retired for model selection after quality problems.)
 */

const MODEL = {} as LanguageModel;

function phase(): Phase {
  return {
    phase: 1,
    name: 'Manifesto',
    seed: [],
    followUpPolicy: { maxGenerated: 5, onlySeverity: ['blocking', 'important'] },
    synthesis: {
      pass: 'synthesise-manifesto',
      model: 'deep',
      artifacts: ['01-MANIFESTO.md', '01-AI-LAWS.md'],
    },
  };
}

describe('deep-everywhere tier wiring', () => {
  it('the analyse pass requests the deep tier (timeout matches the deep model)', async () => {
    const captured: GenerateArgs<unknown>[] = [];
    const client = {
      generate: async (args: GenerateArgs<unknown>): Promise<LlmOutcome<unknown>> => {
        captured.push(args);
        return { status: 'degraded', reason: 'stub' };
      },
    } as unknown as LLMClient;

    const session = makeSession({
      currentPhase: 1,
      phases: [
        {
          id: 1,
          status: 'in_progress',
          answers: [],
          followUpsAsked: 0,
          analysisRuns: 0,
          artifactPaths: [],
        },
      ],
    });
    await createAnalyse({ client, model: MODEL })(phase(), session);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.tier).toBe('deep');
  });

  it("no pass or the connectivity check declares tier: 'fast'", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const llmDir = join(here, '..', '..', 'src', 'llm');
    const passesDir = join(llmDir, 'passes');
    const files = [
      join(llmDir, 'connectivity.ts'),
      ...readdirSync(passesDir)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => join(passesDir, f)),
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not request the retired fast tier`).not.toMatch(
        /tier:\s*'fast'/,
      );
      if (source.includes('.generate(')) {
        expect(source, `${file} calls the client but declares no deep tier`).toMatch(
          /tier:\s*'deep'/,
        );
      }
    }
  });
});
