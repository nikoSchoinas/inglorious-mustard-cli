import { describe, expect, it } from 'vitest';
import { runPhase2A } from '../../src/engine/phase-2a.js';
import { defaultFixturesRoot } from '../../src/llm/fixtures.js';
import {
  FakeTransport,
  type LLMTransport,
  ReplayTransport,
  type TransportRequest,
  type TransportResult,
} from '../../src/llm/transport.js';
import { DomainExtraction } from '../../src/schemas/extraction.js';
import type { MustardSession } from '../../src/schemas/session.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import { ScriptedPrompter } from '../../src/ui/scripted-prompter.js';
import { CLOCK } from '../golden/phase1-skeleton.js';
import {
  CANCEL_SCRIPT,
  CANNED_EXTRACT,
  FULL_SCRIPT,
  RESUME_SCRIPT,
  phase2Passes,
  phase2StartSession,
  runPhase2AScripted,
} from '../golden/phase2a-fixture.js';

/**
 * M8 acceptance test (technical-plan §5): Phase 2A, part A — capture → extract →
 * reflection → capability loop, driven in REPLAY mode over committed fixtures (zero
 * tokens). Proves the confirmed `DomainExtraction` lands in session state with STABLE
 * ids under corrections, plus the Ctrl-C → resume identity that never re-calls the LLM.
 */

function replayTransport(): ReplayTransport {
  return new ReplayTransport(defaultFixturesRoot());
}

/** A save that captures the latest persisted session (survives a mid-run cancel). */
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

function extractionOf(session: MustardSession): DomainExtraction {
  const ps = session.phases.find((p) => p.id === 2);
  return DomainExtraction.parse(ps?.synthesisedObject);
}

describe('runPhase2A — full replay run', () => {
  it('confirms a DomainExtraction with stable ids after removing an actor and adding an entity', async () => {
    const { session } = await runPhase2AScripted({
      transport: replayTransport(),
      script: FULL_SCRIPT,
    });

    const ex = extractionOf(session);

    // Removed actor gone; the surviving primary actor is byte-identical.
    expect(ex.actors.map((a) => a.id)).toEqual(['a1']);
    expect(ex.actors[0]).toEqual(CANNED_EXTRACT.actors[0]);

    // Added entity has a new, non-colliding id; original entity ids are untouched.
    expect(ex.entities.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    const streak = ex.entities.find((e) => e.id === 'e3');
    expect(streak?.name).toBe('Streak');

    // Capabilities were rebuilt for the confirmed actor: two accepted suggestions
    // plus one custom entry, all bound to the surviving actor, no dangling actorId.
    const actorIds = new Set(ex.actors.map((a) => a.id));
    expect(ex.capabilities.every((c) => actorIds.has(c.actorId))).toBe(true);
    expect(ex.capabilities.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    const custom = ex.capabilities.find((c) => c.verb === 'set a reminder');
    expect(custom).toMatchObject({ actorId: 'a1', object: '', description: 'set a reminder' });

    // Derived fact for later phases.
    expect(session.facts.actorCount).toBe(1);

    // The phase is left in progress — M9's WRITE step accepts it.
    expect(session.phases.find((p) => p.id === 2)?.status).toBe('in_progress');
  });

  it('shows the reflection summary before asking for corrections', async () => {
    const { prompter } = await runPhase2AScripted({
      transport: replayTransport(),
      script: FULL_SCRIPT,
    });
    const reflection = prompter.notes.find((n) => n.title === 'Reflection');
    expect(reflection?.message).toMatchSnapshot();
  });
});

describe('runPhase2A — Ctrl-C then resume', () => {
  it('resumes from the raw extraction without re-calling the extract pass', async () => {
    const transport = new CountingTransport(replayTransport());
    const { save, last } = memorySave();
    const passes = phase2Passes(transport);

    // Run 1: cancel at the first reflection prompt (EXTRACT has already run).
    await expect(
      runPhase2A(phase2StartSession(), {
        prompter: new ScriptedPrompter(CANCEL_SCRIPT),
        extract: passes.extract,
        suggestCapabilities: passes.suggestCapabilities,
        now: CLOCK,
        save,
      }),
    ).rejects.toBeInstanceOf(PromptCancelledError);

    // Nothing lost: capture recorded, raw extraction persisted, reflection not done.
    const mid = last();
    const midPs = mid.phases.find((p) => p.id === 2);
    expect(midPs?.answers.map((a) => a.questionId)).toEqual(['p2.capture']);
    expect(extractionOf(mid)).toEqual(CANNED_EXTRACT);
    expect(transport.counts.extract).toBe(1);

    // Run 2: resume with the remaining answers; extract must NOT be called again.
    const resumed = await runPhase2A(mid, {
      prompter: new ScriptedPrompter(RESUME_SCRIPT),
      extract: passes.extract,
      suggestCapabilities: passes.suggestCapabilities,
      now: CLOCK,
      save,
    });

    expect(transport.counts.extract).toBe(1); // still one, across both runs
    expect(transport.counts['suggest-capabilities']).toBe(1);

    // The resumed result matches a clean single run byte-for-byte.
    const { session: clean } = await runPhase2AScripted({
      transport: replayTransport(),
      script: FULL_SCRIPT,
    });
    expect(extractionOf(resumed)).toEqual(extractionOf(clean));
  });
});

describe('runPhase2A — separate per-actor suggestion pass', () => {
  it('suggests capabilities for an actor the user ADDED during reflection', async () => {
    // A minimal EXTRACT (one actor, no entities) so an added actor is easy to isolate.
    const extract: DomainExtraction = {
      actors: [{ id: 'a1', name: 'Member', description: 'The main user', isPrimary: true }],
      entities: [],
      capabilities: [],
    };
    const transport = new FakeTransport([
      { kind: 'object', value: extract },
      { kind: 'object', value: [{ verb: 'create', object: 'habit', description: 'x' }] },
      { kind: 'object', value: [{ verb: 'review', object: 'progress', description: 'y' }] },
    ]);

    await runPhase2AScripted({
      transport,
      script: [
        {
          kind: 'editor',
          value:
            'A member uses the app to build a daily habit and track it over many weeks, ' +
            'checking in each day to mark it done, so that they stay consistent and ' +
            'motivated while an auditor reviews overall progress across the whole team.',
        },
        { kind: 'multiselect', value: [] }, // remove actors → keep Member
        { kind: 'text', value: 'Auditor' }, // add actor Auditor (→ a2)
        { kind: 'text', value: '' }, // add entities → none (entities empty, so no remove step)
        { kind: 'multiselect', value: [] }, // Member capabilities
        { kind: 'text', value: '' }, // Member custom
        { kind: 'multiselect', value: [] }, // Auditor capabilities
        { kind: 'text', value: '' }, // Auditor custom
      ],
    });

    const suggested = transport.calls
      .filter((c) => c.pass === 'suggest-capabilities')
      .map((c) => (c.input as { actor: { name: string } }).actor.name);
    expect(suggested).toContain('Member');
    expect(suggested).toContain('Auditor');
  });
});
