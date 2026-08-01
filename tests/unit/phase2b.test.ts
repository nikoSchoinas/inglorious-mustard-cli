import { describe, expect, it } from 'vitest';
import { isValidOrder } from '../../src/engine/phase-2b-order.js';
import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import {
  type LLMTransport,
  ReplayTransport,
  type TransportRequest,
  type TransportResult,
} from '../../src/llm/transport.js';
import { DomainExtraction } from '../../src/schemas/extraction.js';
import { Phase2Output } from '../../src/schemas/phase2-output.js';
import type { MustardSession } from '../../src/schemas/session.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import {
  CANCEL_2B_SCRIPT,
  CONFIRMED_EXTRACTION,
  FULL_2B_SCRIPT,
  RESUME_2B_SCRIPT,
  phase2bStartSession,
  runPhase2BScripted,
} from '../golden/phase2b-fixture.js';

/**
 * M9 acceptance test (technical-plan §5): Phase 2B — happy paths, the signature
 * failure interrogation, dependency ordering, the UI step and `02-USE-CASES.md`,
 * driven in REPLAY mode over committed fixtures (zero tokens). Proves the complete
 * `Phase2Output` lands in session state, every use case gets a failure path, the
 * build order is recorded, and Ctrl-C → resume never re-runs a completed use case.
 */

function replayTransport(): ReplayTransport {
  return new ReplayTransport(defaultFixturesRoot());
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

/** Counts transport calls per pass, delegating to an inner transport. */
class CountingTransport implements LLMTransport {
  readonly counts: Record<string, number> = {};
  constructor(private readonly inner: LLMTransport) {}
  async generate<T>(req: TransportRequest<T>): Promise<TransportResult<T>> {
    this.counts[req.pass] = (this.counts[req.pass] ?? 0) + 1;
    return this.inner.generate(req);
  }
}

function outputOf(session: MustardSession): Phase2Output {
  const ps = session.phases.find((p) => p.id === 2);
  return Phase2Output.parse(ps?.synthesisedObject);
}

describe('runPhase2B — full replay run', () => {
  it('produces a complete Phase2Output and writes 02-USE-CASES.md', async () => {
    const { session, writes } = await runPhase2BScripted({
      transport: replayTransport(),
      script: FULL_2B_SCRIPT,
    });
    const output = outputOf(session);

    // One use case per capability, each with an accepted happy path.
    expect(output.useCases.map((u) => u.id)).toEqual(['uc1', 'uc2', 'uc3']);
    expect(output.useCases.every((u) => u.happyPath.length > 0)).toBe(true);

    // ACCEPTANCE: every use case has at least one failure path (§8.5 step 6).
    expect(output.useCases.every((u) => u.failurePaths.length >= 1)).toBe(true);

    // The build order is a valid permutation, recorded for Phase 6.
    expect(output.dependencyOrder).toEqual(['uc1', 'uc2', 'uc3']);
    expect(isValidOrder(output.dependencyOrder, output.useCases)).toBe(true);

    // The UI step is captured.
    expect(output.screens).toEqual({ approach: 'sketch', screens: ['Create habit', 'Sign in'] });

    // The artifact was written, exactly one file.
    expect(writes.map((w) => w.name)).toEqual(['02-USE-CASES.md']);

    // The phase is accepted and the mission advances to Phase 3.
    expect(session.phases.find((p) => p.id === 2)?.status).toBe('accepted');
    expect(session.currentPhase).toBe(3);
  });

  it('snapshots the rendered 02-USE-CASES.md', async () => {
    const { writes } = await runPhase2BScripted({
      transport: replayTransport(),
      script: FULL_2B_SCRIPT,
    });
    expect(writes[0]?.body).toMatchSnapshot();
  });

  it('keeps the part-A extraction readable for Phase 3 (M10 access guard)', async () => {
    const { session } = await runPhase2BScripted({
      transport: replayTransport(),
      script: FULL_2B_SCRIPT,
    });
    // Phase 3 reads entities via `Phase2Output.extraction`, not the bare object.
    expect(DomainExtraction.parse(outputOf(session).extraction)).toEqual(CONFIRMED_EXTRACTION);
  });
});

describe('runPhase2B — Ctrl-C then resume', () => {
  it('resumes without re-running a completed use case', async () => {
    const transport = new CountingTransport(replayTransport());
    const { save, last } = memorySave();
    const start = phase2bStartSession();

    // Run 1: cancel at use case 2's first failure question (uc1 already complete).
    await expect(
      runPhase2BScripted({ transport, script: CANCEL_2B_SCRIPT, session: start, save }),
    ).rejects.toBeInstanceOf(PromptCancelledError);

    // Run 2: resume with the remaining answers.
    const { session: resumed } = await runPhase2BScripted({
      transport,
      script: RESUME_2B_SCRIPT,
      session: last(),
      save,
    });

    // Happy paths (all done before the cancel) were never re-drafted; uc1's failure
    // structuring (also done) was never re-run — only the in-flight use case repeats.
    expect(transport.counts['happy-path']).toBe(3);
    expect(transport.counts['failure-structure']).toBe(3);

    // The resumed result matches a clean single run.
    const { session: clean } = await runPhase2BScripted({
      transport: replayTransport(),
      script: FULL_2B_SCRIPT,
    });
    expect(outputOf(resumed)).toEqual(outputOf(clean));
    expect(resumed.phases.find((p) => p.id === 2)?.status).toBe('accepted');
  });
});
