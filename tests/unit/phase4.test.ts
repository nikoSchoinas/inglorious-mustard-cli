import { describe, expect, it } from 'vitest';
import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import {
  type LLMTransport,
  ReplayTransport,
  type TransportRequest,
  type TransportResult,
} from '../../src/llm/transport.js';
import type { MustardSession, PhaseState } from '../../src/schemas/session.js';
import { Phase4Output } from '../../src/schemas/stack.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import {
  CANCEL_4_SCRIPT,
  FULL_4_SCRIPT,
  RESUME_4_SCRIPT,
  phase4StartSession,
  runPhase4Scripted,
} from '../golden/phase4-fixture.js';

/**
 * M11 acceptance test (technical-plan §5): Phase 4 — Tools & Technologies. Driven in
 * REPLAY mode over the committed fixtures (zero tokens). Proves the four proposal-review
 * branches, that a locked override survives, that `needs.*` facts reach the propose-stack
 * input, that `03-STRUCTURE.md` exists ONLY after Phase 4 (the positive counterpart to
 * M10's negative test), and that Ctrl-C → resume never re-runs completed work.
 */

function replayTransport(): ReplayTransport {
  return new ReplayTransport(defaultFixturesRoot());
}

/** Wraps a transport to count calls per pass — proves resume does not re-invoke passes. */
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

function phase4State(session: MustardSession): PhaseState {
  const ps = session.phases.find((p) => p.id === 4);
  if (ps === undefined) {
    throw new Error('no Phase 4 state');
  }
  return ps;
}

function outputOf(session: MustardSession): Phase4Output {
  return Phase4Output.parse(phase4State(session).synthesisedObject);
}

describe('runPhase4 — full replay run', () => {
  it('resolves every proposal branch and writes both artifacts', async () => {
    const { session, writes } = await runPhase4Scripted({
      transport: replayTransport(),
      script: FULL_4_SCRIPT,
    });
    const output = outputOf(session);

    // Four decisions, one per branch.
    const byCategory = new Map(output.decisions.map((d) => [d.category, d]));

    // accept (after explain-more): unchanged Next.js.
    expect(byCategory.get('frontend')?.choice).toBe('Next.js');
    expect(byCategory.get('frontend')?.locked).toBe(false);

    // plain accept: PostgreSQL.
    expect(byCategory.get('database')?.choice).toBe('PostgreSQL');

    // choose-alternative: S3 → Cloudflare R2.
    expect(byCategory.get('storage')?.choice).toBe('Cloudflare R2');

    // already-decided: overridden AND locked (survives any redo — §8.7).
    expect(byCategory.get('auth')?.choice).toBe('Auth0');
    expect(byCategory.get('auth')?.locked).toBe(true);

    // ACCEPTANCE: uploads=true produced a storage decision (needs→stack rubric).
    expect(byCategory.has('storage')).toBe(true);

    // ACCEPTANCE: both artifacts written, in the declared order.
    expect(writes.map((w) => w.name)).toEqual(['04-STACK.md', '03-STRUCTURE.md']);

    // The phase is accepted and the mission advances to Phase 5.
    expect(phase4State(session).status).toBe('accepted');
    expect(phase4State(session).artifactPaths).toEqual(['04-STACK.md', '03-STRUCTURE.md']);
    expect(session.currentPhase).toBe(5);
  });

  it('feeds the derived needs.* facts into the propose-stack input', async () => {
    const transport = new CountingTransport(replayTransport());
    await runPhase4Scripted({ transport, script: FULL_4_SCRIPT });

    expect(transport.counts['propose-stack']).toBe(1);
    const input = transport.inputs['propose-stack']?.[0] as {
      needs: Record<string, unknown>;
      context: Record<string, unknown>;
    };
    // The business answers reached the pass as derived needs.* / context.* facts.
    expect(input.needs.objectStorage).toBe(true);
    expect(input.needs.payments).toBe(false);
    expect(input.needs.auth).toBe('email-password');
    expect(input.context.runTarget).toBe('web');
  });

  it('records needs.objectStorage=true in the facts store', async () => {
    const { session } = await runPhase4Scripted({
      transport: replayTransport(),
      script: FULL_4_SCRIPT,
    });
    expect(session.facts['needs.objectStorage']).toBe(true);
    expect(session.facts['context.runTarget']).toBe('web');
  });

  it('snapshots 04-STACK.md and 03-STRUCTURE.md', async () => {
    const { writes } = await runPhase4Scripted({
      transport: replayTransport(),
      script: FULL_4_SCRIPT,
    });
    expect(writes.find((w) => w.name === '04-STACK.md')?.body).toMatchSnapshot();
    expect(writes.find((w) => w.name === '03-STRUCTURE.md')?.body).toMatchSnapshot();
  });
});

describe('runPhase4 — 03-STRUCTURE.md is a Phase 4 output (pitfall §7.1)', () => {
  it('did not exist before Phase 4 and does after', async () => {
    // Before Phase 4, the start session has only the Phase 3 artifact recorded.
    const start = phase4StartSession();
    expect(start.phases.find((p) => p.id === 3)?.artifactPaths).toEqual(['03-SCHEMAS.md']);

    const { writes } = await runPhase4Scripted({
      transport: replayTransport(),
      script: FULL_4_SCRIPT,
    });
    expect(writes.map((w) => w.name)).toContain('03-STRUCTURE.md');
  });
});

describe('runPhase4 — Ctrl-C then resume', () => {
  it('resumes mid decision-loop without re-running any pass', async () => {
    const transport = new CountingTransport(replayTransport());
    const { save, last } = memorySave();
    const start = phase4StartSession();

    // Run 1: cancel while reviewing the third decision (two already resolved).
    await expect(
      runPhase4Scripted({ transport, script: CANCEL_4_SCRIPT, session: start, save }),
    ).rejects.toBeInstanceOf(PromptCancelledError);

    // propose-stack + explain-stack ran once; structure has NOT run yet.
    expect(transport.counts['propose-stack']).toBe(1);
    expect(transport.counts['explain-stack']).toBe(1);
    expect(transport.counts['propose-structure']).toBeUndefined();

    // Run 2: resume with only the remaining answers.
    const { session: resumed } = await runPhase4Scripted({
      transport,
      script: RESUME_4_SCRIPT,
      session: last(),
      save,
    });

    // No pass was re-run: propose-stack/explain-stack still once, structure once.
    expect(transport.counts['propose-stack']).toBe(1);
    expect(transport.counts['explain-stack']).toBe(1);
    expect(transport.counts['propose-structure']).toBe(1);

    // The resumed output matches a clean single run.
    const { session: clean } = await runPhase4Scripted({
      transport: replayTransport(),
      script: FULL_4_SCRIPT,
    });
    expect(outputOf(resumed)).toEqual(outputOf(clean));
    expect(phase4State(resumed).status).toBe('accepted');
  });
});
