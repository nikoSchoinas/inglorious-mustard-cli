import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';
import { LLMClient } from '../../src/llm/client.js';
import { createAnalyse } from '../../src/llm/passes/analyse.js';
import { createSynthesise } from '../../src/llm/passes/synthesise.js';
import { FakeTransport } from '../../src/llm/transport.js';
import type { Phase } from '../../src/questions/types.js';
import type { ManifestoArtifact } from '../../src/schemas/manifesto.js';
import { makeSession } from './fixtures.js';

// FakeTransport ignores the model handle, so a stub is fine.
const MODEL = {} as LanguageModel;
const CLOCK = () => '2026-08-01T00:00:00.000Z';

function client(transport: FakeTransport): LLMClient {
  // No real waits: zero-delay backoff/sleep so the schema-retry path is instant.
  return new LLMClient({ transport, backoff: () => 0, sleep: async () => {} });
}

function manifestoPhase(): Phase {
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

function sessionWithManifestoAnswers() {
  return makeSession({
    currentPhase: 1,
    phases: [
      {
        id: 1,
        status: 'awaiting_review',
        answers: [
          {
            questionId: 'p1.why',
            type: 'editor',
            value: 'Because habits are hard.',
            source: 'seed',
            askedAt: CLOCK(),
          },
          {
            questionId: 'p1.name',
            type: 'text',
            value: 'Habit Tracker',
            source: 'seed',
            askedAt: CLOCK(),
          },
        ],
        followUpsAsked: 0,
        analysisRuns: 1,
        artifactPaths: [],
      },
    ],
  });
}

function manifesto(overrides: Partial<ManifestoArtifact> = {}): ManifestoArtifact {
  return {
    projectName: 'Habit Tracker',
    mission: 'People who want a daily habit have nowhere simple and private to track it.',
    values: [{ title: 'Ship before perfect', rationale: 'A working slice beats a plan.' }],
    aiLaws: ['Write tests alongside every feature.'],
    ...overrides,
  };
}

describe('createAnalyse', () => {
  it('returns the parsed PhaseAnalysis from the transport', async () => {
    const transport = new FakeTransport([
      {
        kind: 'object',
        value: { gaps: [], contradictions: [], derivedFacts: [], readyToSynthesise: true },
      },
    ]);
    const analyse = createAnalyse({ client: client(transport), model: MODEL });
    const outcome = await analyse(manifestoPhase(), sessionWithManifestoAnswers());
    expect(outcome.status).toBe('ok');
    expect(transport.calls[0]?.pass).toBe('analyse');
  });
});

describe('createSynthesise (manifesto)', () => {
  it('renders both artifacts from a valid ManifestoArtifact', async () => {
    const transport = new FakeTransport([{ kind: 'object', value: manifesto() }]);
    const synthesise = createSynthesise({
      client: client(transport),
      model: MODEL,
      mustardVersion: '0.1.0',
      now: CLOCK,
    });
    const outcome = await synthesise(manifestoPhase(), sessionWithManifestoAnswers(), undefined);
    if (outcome.status !== 'ok') {
      throw new Error(`expected ok, got degraded: ${outcome.reason}`);
    }
    const names = outcome.value.artifacts.map((a) => a.name);
    expect(names).toEqual(['01-MANIFESTO.md', '01-AI-LAWS.md']);
    expect(outcome.value.artifacts[0]?.body).toContain('# Habit Tracker — Manifesto');
  });

  it('re-synthesises once when the AI-LAWS line cap is breached, then succeeds', async () => {
    const tooManyLaws = Array.from({ length: 250 }, (_v, i) => `Law ${i + 1}.`);
    const transport = new FakeTransport([
      { kind: 'object', value: manifesto({ aiLaws: tooManyLaws }) }, // breaches 200-line cap
      { kind: 'object', value: manifesto() }, // corrective retry fits
    ]);
    const synthesise = createSynthesise({
      client: client(transport),
      model: MODEL,
      mustardVersion: '0.1.0',
      now: CLOCK,
    });
    const outcome = await synthesise(manifestoPhase(), sessionWithManifestoAnswers(), undefined);
    expect(outcome.status).toBe('ok');
    expect(transport.calls).toHaveLength(2); // one corrective re-synthesis
  });

  it('degrades when the cap is still breached after the corrective retry', async () => {
    const tooManyLaws = Array.from({ length: 250 }, (_v, i) => `Law ${i + 1}.`);
    const transport = new FakeTransport([
      { kind: 'object', value: manifesto({ aiLaws: tooManyLaws }) },
      { kind: 'object', value: manifesto({ aiLaws: tooManyLaws }) },
    ]);
    const synthesise = createSynthesise({
      client: client(transport),
      model: MODEL,
      mustardVersion: '0.1.0',
      now: CLOCK,
    });
    const outcome = await synthesise(manifestoPhase(), sessionWithManifestoAnswers(), undefined);
    expect(outcome.status).toBe('degraded');
  });
});
