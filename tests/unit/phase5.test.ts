import { describe, expect, it } from 'vitest';
import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import {
  type LLMTransport,
  ReplayTransport,
  type TransportRequest,
  type TransportResult,
} from '../../src/llm/transport.js';
import { Phase5Output } from '../../src/schemas/architecture.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import {
  CANCEL_5_SCRIPT,
  FULL_5_SCRIPT,
  RESUME_5_SCRIPT,
  phase5StartSession,
  runPhase5Scripted,
} from '../golden/phase5-fixture.js';

/**
 * M12 acceptance test (technical-plan §5): Phase 5 — Architecture. Driven in REPLAY mode
 * over the committed fixtures (zero tokens). Proves derived facts from Phases 2–4 reach the
 * synthesis input, that Phase 5 asks ≤ 2 seed questions plus capped follow-ups, that each
 * irreversibility confirm is recorded individually in `05-DECISIONS.md` (including the
 * non-blocking declined case), and that Ctrl-C → resume never re-runs completed work.
 */

function replayTransport(): ReplayTransport {
  return new ReplayTransport(defaultFixturesRoot());
}

/** Wraps a transport to count calls per pass and capture inputs — proves resume and facts flow. */
class CountingTransport implements LLMTransport {
  readonly counts: Record<string, number> = {};
  readonly inputs: Record<string, unknown[]> = {};
  constructor(private readonly inner: LLMTransport) {}
  async generate<T>(req: TransportRequest<T>): Promise<TransportResult<T>> {
    this.counts[req.pass] = (this.counts[req.pass] ?? 0) + 1;
    const seen = this.inputs[req.pass] ?? [];
    seen.push(req.input);
    this.inputs[req.pass] = seen;
    return this.inner.generate(req);
  }
}

function memorySave(): { save: (s: MustardSession) => MustardSession; last: () => MustardSession } {
  let latest: MustardSession | undefined;
  return {
    save: (s) => {
      latest = s;
      return s;
    },
    last: () => {
      if (latest === undefined) {
        throw new Error('nothing saved yet');
      }
      return latest;
    },
  };
}

function phase5State(session: MustardSession): PhaseState {
  const ps = session.phases.find((p) => p.id === 5);
  if (ps === undefined) {
    throw new Error('no Phase 5 state');
  }
  return ps;
}

function outputOf(session: MustardSession): Phase5Output {
  return Phase5Output.parse(phase5State(session).synthesisedObject);
}

describe('runPhase5 — full replay run', () => {
  it('synthesises the architecture, records every confirm, writes both artifacts', async () => {
    const { session, writes } = await runPhase5Scripted({
      transport: replayTransport(),
      script: FULL_5_SCRIPT,
    });
    const output = outputOf(session);

    // The component graph and the two riskiest flows are stored.
    expect(output.componentGraph.components.map((c) => c.id)).toEqual(['web', 'api', 'db']);
    expect(output.sequenceSelections.map((s) => s.useCaseId)).toEqual(['uc1', 'uc2']);
    expect(output.selectedUseCases.map((u) => u.id)).toEqual(['uc1', 'uc2']);

    // Three irreversible decisions, each confirmed individually (two locked, one declined).
    expect(output.irreversibleDecisions).toHaveLength(3);
    expect(output.confirmations.map((c) => [c.decisionId, c.confirmed])).toEqual([
      ['IRR-1', true],
      ['IRR-2', true],
      ['IRR-3', false],
    ]);

    // Both artifacts written, in the declared order; the phase advances to Phase 6.
    expect(writes.map((w) => w.name)).toEqual(['05-ARCHITECTURE.md', '05-DECISIONS.md']);
    expect(phase5State(session).status).toBe('accepted');
    expect(phase5State(session).artifactPaths).toEqual(['05-ARCHITECTURE.md', '05-DECISIONS.md']);
    expect(session.currentPhase).toBe(6);
  });

  it('asks exactly two seed questions plus capped follow-ups', async () => {
    const { session } = await runPhase5Scripted({
      transport: replayTransport(),
      script: FULL_5_SCRIPT,
    });
    const seedIds = phase5State(session)
      .answers.filter((a) => a.source === 'seed')
      .map((a) => a.questionId);
    expect(seedIds).toEqual(['p5.heavy-work', 'p5.data-sharing']);

    // Follow-ups are capped by the phase policy (maxGenerated 2); the fixture flags one gap.
    expect(phase5State(session).followUpsAsked).toBe(1);
    expect(phase5State(session).followUpsAsked).toBeLessThanOrEqual(2);
  });

  it('feeds derived facts and prior-phase outputs into the synthesis input', async () => {
    const transport = new CountingTransport(replayTransport());
    await runPhase5Scripted({ transport, script: FULL_5_SCRIPT });

    expect(transport.counts['synthesise-architecture']).toBe(1);
    const input = transport.inputs['synthesise-architecture']?.[0] as {
      arch: Record<string, unknown>;
      needs: Record<string, unknown>;
      context: Record<string, unknown>;
      stack: Array<{ category: string }>;
      models: Array<{ name: string }>;
      useCases: Array<{ id: string; failurePathCount: number }>;
    };
    // The two seed answers arrived as arch.* facts.
    expect(input.arch.heavyWork).toBe('server');
    expect(input.arch.dataSharing).toBe(true);
    // The Phase 4 needs.*/context.* facts flowed through.
    expect(input.needs.objectStorage).toBe(true);
    expect(input.context.runTarget).toBe('web');
    // The Phase 3/4 typed outputs are projected in.
    expect(input.stack.length).toBeGreaterThan(0);
    expect(input.models.length).toBeGreaterThan(0);
    // Use cases carry a pre-computed failure-path count so the model's ranking is anchored.
    expect(input.useCases.find((u) => u.id === 'uc1')?.failurePathCount).toBe(2);
  });

  it('records each confirm outcome in 05-DECISIONS.md', async () => {
    const { writes } = await runPhase5Scripted({
      transport: replayTransport(),
      script: FULL_5_SCRIPT,
    });
    const decisions = writes.find((w) => w.name === '05-DECISIONS.md')?.body ?? '';
    // The confirmed pair shows a lock-in; the declined one is flagged, never dropped.
    expect(decisions).toContain('IRR-1 — Authentication model');
    expect(decisions).toContain('Confirmed ✓');
    expect(decisions).toContain('IRR-3 — Single-region hosting');
    expect(decisions).toContain('Not confirmed — revisit before building.');
    // The ADR log renders here (§3.2), not in the architecture file.
    expect(decisions).toContain('ADR-001');
  });

  it('explains why each sequence diagram was drawn in 05-ARCHITECTURE.md', async () => {
    const { writes } = await runPhase5Scripted({
      transport: replayTransport(),
      script: FULL_5_SCRIPT,
    });
    const architecture = writes.find((w) => w.name === '05-ARCHITECTURE.md')?.body ?? '';
    expect(architecture).toContain('Creating a habit has the most failure paths');
    expect(architecture).toContain('failure paths: 2, touches 3 components');
    // Diagrams are present and the ADR log is NOT duplicated here.
    expect(architecture).toContain('```mermaid');
    expect(architecture).not.toContain('ADR-001');
  });

  it('snapshots 05-ARCHITECTURE.md and 05-DECISIONS.md', async () => {
    const { writes } = await runPhase5Scripted({
      transport: replayTransport(),
      script: FULL_5_SCRIPT,
    });
    expect(writes.find((w) => w.name === '05-ARCHITECTURE.md')?.body).toMatchSnapshot();
    expect(writes.find((w) => w.name === '05-DECISIONS.md')?.body).toMatchSnapshot();
  });
});

describe('runPhase5 — Ctrl-C then resume', () => {
  it('resumes mid irreversibility-gate without re-running any pass', async () => {
    const transport = new CountingTransport(replayTransport());
    const { save, last } = memorySave();
    const start = phase5StartSession();

    // Run 1: cancel while confirming the third irreversible decision (two already recorded).
    await expect(
      runPhase5Scripted({ transport, script: CANCEL_5_SCRIPT, session: start, save }),
    ).rejects.toBeInstanceOf(PromptCancelledError);

    // analyse + synthesise-architecture ran once each; the gate does not call a pass.
    expect(transport.counts.analyse).toBe(1);
    expect(transport.counts['synthesise-architecture']).toBe(1);
    // The first two confirms are already persisted.
    expect(outputOf(last()).confirmations.map((c) => c.decisionId)).toEqual(['IRR-1', 'IRR-2']);

    // Run 2: resume with only the remaining confirm + writes.
    const { session: resumed } = await runPhase5Scripted({
      transport,
      script: RESUME_5_SCRIPT,
      session: last(),
      save,
    });

    // No pass was re-run.
    expect(transport.counts.analyse).toBe(1);
    expect(transport.counts['synthesise-architecture']).toBe(1);

    // The resumed output matches a clean single run.
    const { session: clean } = await runPhase5Scripted({
      transport: replayTransport(),
      script: FULL_5_SCRIPT,
    });
    expect(outputOf(resumed)).toEqual(outputOf(clean));
    expect(phase5State(resumed).status).toBe('accepted');
    expect(resumed.currentPhase).toBe(6);
  });
});
