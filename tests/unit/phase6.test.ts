import { describe, expect, it } from 'vitest';
import { isValidOrder } from '../../src/engine/topo.js';
import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import {
  type LLMTransport,
  ReplayTransport,
  type TransportRequest,
  type TransportResult,
} from '../../src/llm/transport.js';
import { Phase6Output } from '../../src/schemas/roadmap.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import {
  CANCEL_6_SCRIPT,
  FULL_6_SCRIPT,
  ORDERED_TASK_IDS,
  RESUME_6_SCRIPT,
  phase6StartSession,
  runPhase6Scripted,
} from '../golden/phase6-fixture.js';

/**
 * M13 acceptance test (technical-plan §5): Phase 6 — Roadmap. Driven in REPLAY mode over
 * the committed fixtures (zero tokens). Proves the sequence pass sizes the tasks, that
 * DETERMINISTIC code sorts them into a valid topological order and mirrors them into
 * `session.tasks`, that the two seed answers reach the pass input, and that Ctrl-C → resume
 * never re-runs a completed pass.
 */

function replayTransport(): ReplayTransport {
  return new ReplayTransport(defaultFixturesRoot());
}

/** Wraps a transport to count calls per pass and capture inputs. */
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

function phase6State(session: MustardSession): PhaseState {
  const ps = session.phases.find((p) => p.id === 6);
  if (ps === undefined) {
    throw new Error('no Phase 6 state');
  }
  return ps;
}

function outputOf(session: MustardSession): Phase6Output {
  return Phase6Output.parse(phase6State(session).synthesisedObject);
}

describe('runPhase6 — full replay run', () => {
  it('sequences the tasks, orders them deterministically, writes the roadmap', async () => {
    const { session, writes } = await runPhase6Scripted({
      transport: replayTransport(),
      script: FULL_6_SCRIPT,
    });
    const output = outputOf(session);

    // The tasks are sorted into a valid topological order — the canned sequence listed
    // T003 before its dependency T002, and the deterministic sort fixed it.
    expect(output.orderedTasks.map((t) => t.id)).toEqual([...ORDERED_TASK_IDS]);
    expect(
      isValidOrder(
        output.orderedTasks.map((t) => t.id),
        output.orderedTasks,
      ),
    ).toBe(true);
    // Every task carries the default `todo` status.
    expect(output.orderedTasks.every((t) => t.status === 'todo')).toBe(true);
    // The two answers are echoed for the roadmap header.
    expect(output.hoursPerWeek).toBe('under-5');
    expect(output.testingPolicy).toBe('critical');

    // The ordered tasks are mirrored into session.tasks for Phase 7 / `mustard prompts`.
    expect(session.tasks.map((t) => t.id)).toEqual([...ORDERED_TASK_IDS]);

    // The artifact is written and the phase advances to Phase 7.
    expect(writes.map((w) => w.name)).toEqual(['06-ROADMAP.md']);
    expect(phase6State(session).status).toBe('accepted');
    expect(phase6State(session).artifactPaths).toEqual(['06-ROADMAP.md']);
    expect(session.currentPhase).toBe(7);
  });

  it('asks exactly two seed questions plus capped follow-ups', async () => {
    const { session } = await runPhase6Scripted({
      transport: replayTransport(),
      script: FULL_6_SCRIPT,
    });
    const seedIds = phase6State(session)
      .answers.filter((a) => a.source === 'seed')
      .map((a) => a.questionId);
    expect(seedIds).toEqual(['p6.hours-per-week', 'p6.testing-policy']);

    // The fixture flags one gap; the follow-up is capped by the phase policy (maxGenerated 2).
    expect(phase6State(session).followUpsAsked).toBe(1);
    expect(phase6State(session).followUpsAsked).toBeLessThanOrEqual(2);
  });

  it('feeds the answers and prior-phase outputs into the sequence input', async () => {
    const transport = new CountingTransport(replayTransport());
    await runPhase6Scripted({ transport, script: FULL_6_SCRIPT });

    expect(transport.counts.sequence).toBe(1);
    const input = transport.inputs.sequence?.[0] as {
      roadmap: Record<string, unknown>;
      stack: unknown[];
      models: unknown[];
      components: unknown[];
      useCases: Array<{ id: string }>;
      dependencyOrder: string[];
    };
    expect(input.roadmap.hoursPerWeek).toBe('under-5');
    expect(input.roadmap.testingPolicy).toBe('critical');
    expect(input.stack.length).toBeGreaterThan(0);
    expect(input.models.length).toBeGreaterThan(0);
    expect(input.components.length).toBeGreaterThan(0);
    expect(input.useCases.map((u) => u.id)).toEqual(['uc1', 'uc2']);
    expect(input.dependencyOrder).toEqual(['uc1', 'uc2']);
  });

  it('snapshots 06-ROADMAP.md', async () => {
    const { writes } = await runPhase6Scripted({
      transport: replayTransport(),
      script: FULL_6_SCRIPT,
    });
    expect(writes.find((w) => w.name === '06-ROADMAP.md')?.body).toMatchSnapshot();
  });
});

describe('runPhase6 — Ctrl-C then resume', () => {
  it('resumes at the write gate without re-running any pass', async () => {
    const transport = new CountingTransport(replayTransport());
    const { save, last } = memorySave();
    const start = phase6StartSession();

    // Run 1: cancel at the write review, after ANALYSE and SEQUENCE have run.
    await expect(
      runPhase6Scripted({ transport, script: CANCEL_6_SCRIPT, session: start, save }),
    ).rejects.toBeInstanceOf(PromptCancelledError);

    expect(transport.counts.analyse).toBe(1);
    expect(transport.counts.sequence).toBe(1);
    // The sequenced tasks are already persisted.
    expect(last().tasks.map((t) => t.id)).toEqual([...ORDERED_TASK_IDS]);

    // Run 2: resume with only the write review.
    const { session: resumed } = await runPhase6Scripted({
      transport,
      script: RESUME_6_SCRIPT,
      session: last(),
      save,
    });

    // No pass was re-run.
    expect(transport.counts.analyse).toBe(1);
    expect(transport.counts.sequence).toBe(1);

    // The resumed output matches a clean single run.
    const { session: clean } = await runPhase6Scripted({
      transport: replayTransport(),
      script: FULL_6_SCRIPT,
    });
    expect(outputOf(resumed)).toEqual(outputOf(clean));
    expect(phase6State(resumed).status).toBe('accepted');
    expect(resumed.currentPhase).toBe(7);
  });
});
