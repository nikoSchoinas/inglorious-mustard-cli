import { describe, expect, it } from 'vitest';
import {
  type AnalyseFn,
  type RunnerIO,
  type SynthesiseFn,
  runPhase,
} from '../../src/engine/runner.js';
import type { LlmOutcome } from '../../src/llm/client.js';
import { fact } from '../../src/questions/fact.js';
import type { Phase } from '../../src/questions/types.js';
import type { PhaseAnalysis } from '../../src/schemas/analysis.js';
import { MustardSession, type PhaseState } from '../../src/schemas/session.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import { CANCEL, ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { makeSession } from './fixtures.js';

// --------------------------------------------------------------------------
// Fixtures & fakes — a synthetic mini-phase driven by injected passes
// --------------------------------------------------------------------------

const PHASE_ID = 1;

function miniPhase(overrides: Partial<Phase> = {}): Phase {
  return {
    phase: PHASE_ID,
    name: 'Mini',
    seed: [
      { id: 'm.name', type: 'text', prompt: { none: 'Name?' }, mapsTo: 'projectName' },
      {
        id: 'm.mode',
        type: 'select',
        prompt: { none: 'Mode?' },
        mapsTo: 'mode',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      // when-dependent on an earlier answer in the SAME phase.
      {
        id: 'm.extra',
        type: 'text',
        prompt: { none: 'Extra detail?' },
        when: (f) => fact(f, 'mode') === 'b',
      },
    ],
    followUpPolicy: { maxGenerated: 5, onlySeverity: ['blocking', 'important'] },
    synthesis: { pass: 'synth-mini', model: 'deep', artifacts: ['01-MINI.md'] },
    ...overrides,
  };
}

/** A fresh session with no PhaseState for the mini-phase yet (runPhase creates it). */
function freshSession(): MustardSession {
  return makeSession({ currentPhase: PHASE_ID, phases: [] });
}

function ready(overrides: Partial<PhaseAnalysis> = {}): PhaseAnalysis {
  return { gaps: [], contradictions: [], derivedFacts: [], readyToSynthesise: true, ...overrides };
}

function notReady(overrides: Partial<PhaseAnalysis> = {}): PhaseAnalysis {
  return { gaps: [], contradictions: [], derivedFacts: [], readyToSynthesise: false, ...overrides };
}

function gap(id: string, severity: PhaseAnalysis['gaps'][number]['severity']) {
  return {
    id,
    severity,
    description: id,
    suggestedQuestion: `${id}?`,
    suggestedType: 'text' as const,
  };
}

/** A stateful ANALYSE fake that returns each outcome in turn (repeating the last). */
function fakeAnalyse(outcomes: Array<LlmOutcome<PhaseAnalysis>>) {
  let i = 0;
  const fn: AnalyseFn = async () => {
    const outcome = outcomes[Math.min(i, outcomes.length - 1)];
    i++;
    if (outcome === undefined) {
      throw new Error('fakeAnalyse: no outcome');
    }
    return outcome;
  };
  return { fn, calls: () => i };
}

/** A stateful SYNTHESISE fake that records the steering arg of each call. */
function fakeSynthesise(
  outcomes: Array<LlmOutcome<{ object: unknown; artifacts: { name: string; body: string }[] }>>,
) {
  const steerings: Array<'detail' | 'differently' | undefined> = [];
  let i = 0;
  const fn: SynthesiseFn = async (_p, _s, steering) => {
    steerings.push(steering);
    const outcome = outcomes[Math.min(i, outcomes.length - 1)];
    i++;
    if (outcome === undefined) {
      throw new Error('fakeSynthesise: no outcome');
    }
    return outcome;
  };
  return { fn, steerings };
}

function memoryIO(): RunnerIO & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return { files, writeArtifact: (name, body) => void files.set(name, body) };
}

/** In-memory persistence that re-parses (mirroring saveSession's validation) and snapshots each save. */
function memorySave() {
  const snapshots: MustardSession[] = [];
  const save = (s: MustardSession): MustardSession => {
    const parsed = MustardSession.parse(s);
    snapshots.push(parsed);
    return parsed;
  };
  return { save, snapshots };
}

const CLOCK = () => '2026-08-01T00:00:00.000Z';

function phaseOf(session: MustardSession, id = PHASE_ID): PhaseState {
  const ps = session.phases.find((p) => p.id === id);
  if (ps === undefined) {
    throw new Error(`no phase ${id}`);
  }
  return ps;
}

function answersFrom(session: MustardSession, source: 'seed' | 'followup'): string[] {
  return phaseOf(session)
    .answers.filter((a) => a.source === source)
    .map((a) => a.questionId);
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('runPhase — happy path', () => {
  it('seeds, analyses ready, synthesises, accepts, and writes the artifact', async () => {
    const prompter = new ScriptedPrompter([
      { kind: 'text', value: 'My App' },
      { kind: 'select', value: 'a' }, // mode a → m.extra is skipped by `when`
      { kind: 'select', value: 'accept' }, // review gate
    ]);
    const io = memoryIO();
    const { save } = memorySave();
    const synth = fakeSynthesise([
      {
        status: 'ok',
        value: { object: { kind: 'mini' }, artifacts: [{ name: '01-MINI.md', body: 'BODY' }] },
      },
    ]);

    const result = await runPhase(miniPhase(), freshSession(), {
      prompter,
      analyse: fakeAnalyse([{ status: 'ok', value: ready() }]).fn,
      synthesise: synth.fn,
      io,
      now: CLOCK,
      save,
    });

    const ps = phaseOf(result);
    expect(ps.status).toBe('accepted');
    expect(ps.acceptedAt).toBe(CLOCK());
    expect(ps.analysisRuns).toBe(1);
    expect(ps.synthesisedObject).toEqual({ kind: 'mini' });
    expect(ps.artifactPaths).toEqual(['01-MINI.md']);
    expect(ps.edited).toBe(false);
    expect(io.files.get('01-MINI.md')).toBe('BODY');
    expect(result.facts.projectName).toBe('My App');
    expect(result.facts.mode).toBe('a');
    expect(result.currentPhase).toBe(PHASE_ID + 1);
    expect(answersFrom(result, 'seed')).toEqual(['m.name', 'm.mode']); // m.extra skipped
  });
});

describe('runPhase — when-dependent seed', () => {
  it('asks the conditional question only when an earlier answer flips its `when`', async () => {
    const prompter = new ScriptedPrompter([
      { kind: 'text', value: 'My App' },
      { kind: 'select', value: 'b' }, // mode b → m.extra now applies
      { kind: 'text', value: 'the extra detail' },
      { kind: 'select', value: 'accept' },
    ]);
    const io = memoryIO();
    const result = await runPhase(miniPhase(), freshSession(), {
      prompter,
      analyse: fakeAnalyse([{ status: 'ok', value: ready() }]).fn,
      synthesise: fakeSynthesise([
        { status: 'ok', value: { object: {}, artifacts: [{ name: '01-MINI.md', body: 'B' }] } },
      ]).fn,
      io,
      now: CLOCK,
      save: memorySave().save,
    });
    expect(answersFrom(result, 'seed')).toEqual(['m.name', 'm.mode', 'm.extra']);
  });
});

describe('runPhase — ANALYSE loop guard', () => {
  it('re-analyses at most once, then proceeds regardless (never traps)', async () => {
    const prompter = new ScriptedPrompter([
      { kind: 'text', value: 'X' },
      { kind: 'select', value: 'a' },
      { kind: 'text', value: 'follow-up answer' }, // one follow-up for g1
      { kind: 'select', value: 'accept' },
    ]);
    // Not ready both times, always one blocking gap.
    const analyse = fakeAnalyse([
      { status: 'ok', value: notReady({ gaps: [gap('g1', 'blocking')] }) },
      { status: 'ok', value: notReady({ gaps: [gap('g1', 'blocking')] }) },
    ]);
    const result = await runPhase(miniPhase(), freshSession(), {
      prompter,
      analyse: analyse.fn,
      synthesise: fakeSynthesise([
        { status: 'ok', value: { object: {}, artifacts: [{ name: '01-MINI.md', body: 'B' }] } },
      ]).fn,
      io: memoryIO(),
      now: CLOCK,
      save: memorySave().save,
    });
    expect(analyse.calls()).toBe(2); // exactly two ANALYSE runs — the guard
    expect(phaseOf(result).analysisRuns).toBe(2);
    expect(phaseOf(result).status).toBe('accepted');
    expect(answersFrom(result, 'followup')).toEqual(['g1']);
  });
});

describe('runPhase — follow-up cap', () => {
  it('asks at most maxGenerated follow-ups and only admissible severities', async () => {
    const prompter = new ScriptedPrompter([
      { kind: 'text', value: 'X' },
      { kind: 'select', value: 'a' },
      // Five follow-up answers — the cap.
      ...Array.from({ length: 5 }, () => ({ kind: 'text', value: 'ans' }) as ScriptedStep),
      { kind: 'select', value: 'accept' },
    ]);
    const gaps = [
      gap('gtk', 'good_to_know'), // excluded by severity
      gap('g1', 'blocking'),
      gap('g2', 'important'),
      gap('g3', 'blocking'),
      gap('g4', 'important'),
      gap('g5', 'blocking'),
      gap('g6', 'blocking'), // excluded by the cap (6th admissible)
    ];
    const result = await runPhase(miniPhase(), freshSession(), {
      prompter,
      analyse: fakeAnalyse([
        { status: 'ok', value: notReady({ gaps }) },
        { status: 'ok', value: notReady() },
      ]).fn,
      synthesise: fakeSynthesise([
        { status: 'ok', value: { object: {}, artifacts: [{ name: '01-MINI.md', body: 'B' }] } },
      ]).fn,
      io: memoryIO(),
      now: CLOCK,
      save: memorySave().save,
    });
    const asked = answersFrom(result, 'followup');
    expect(asked).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
    expect(asked).not.toContain('gtk'); // severity filtered
    expect(asked).not.toContain('g6'); // cap
    expect(phaseOf(result).followUpsAsked).toBe(5);
  });
});

describe('runPhase — redo loops', () => {
  it('re-runs SYNTHESISE with steering for both redo choices, then accepts the last', async () => {
    const prompter = new ScriptedPrompter([
      { kind: 'text', value: 'X' },
      { kind: 'select', value: 'a' },
      { kind: 'select', value: 'redo-detail' },
      { kind: 'select', value: 'redo-differently' },
      { kind: 'select', value: 'accept' },
    ]);
    const io = memoryIO();
    const synth = fakeSynthesise([
      {
        status: 'ok',
        value: { object: { v: 1 }, artifacts: [{ name: '01-MINI.md', body: 'B1' }] },
      },
      {
        status: 'ok',
        value: { object: { v: 2 }, artifacts: [{ name: '01-MINI.md', body: 'B2' }] },
      },
      {
        status: 'ok',
        value: { object: { v: 3 }, artifacts: [{ name: '01-MINI.md', body: 'B3' }] },
      },
    ]);
    const result = await runPhase(miniPhase(), freshSession(), {
      prompter,
      analyse: fakeAnalyse([{ status: 'ok', value: ready() }]).fn,
      synthesise: synth.fn,
      io,
      now: CLOCK,
      save: memorySave().save,
    });
    expect(synth.steerings).toEqual([undefined, 'detail', 'differently']);
    expect(phaseOf(result).synthesisedObject).toEqual({ v: 3 });
    expect(io.files.get('01-MINI.md')).toBe('B3');
  });
});

describe('runPhase — edit at the review gate', () => {
  it('writes the edited markdown, flags edited, and still retains the typed object', async () => {
    const prompter = new ScriptedPrompter([
      { kind: 'text', value: 'X' },
      { kind: 'select', value: 'a' },
      { kind: 'select', value: 'edit' },
    ]);
    const io = memoryIO();
    const result = await runPhase(miniPhase(), freshSession(), {
      prompter,
      analyse: fakeAnalyse([{ status: 'ok', value: ready() }]).fn,
      synthesise: fakeSynthesise([
        {
          status: 'ok',
          value: { object: { kept: true }, artifacts: [{ name: '01-MINI.md', body: 'ORIGINAL' }] },
        },
      ]).fn,
      io,
      editor: { launch: async (initial) => `EDITED(${initial})` },
      now: CLOCK,
      save: memorySave().save,
    });
    const ps = phaseOf(result);
    expect(ps.edited).toBe(true);
    expect(ps.synthesisedObject).toEqual({ kept: true }); // retained despite the edit
    expect(io.files.get('01-MINI.md')).toBe('EDITED(ORIGINAL)');
  });
});

describe('runPhase — degraded synthesis', () => {
  it('renders the raw answers under a degraded artifact and retains no typed object', async () => {
    const prompter = new ScriptedPrompter([
      { kind: 'text', value: 'My App' },
      { kind: 'select', value: 'a' },
      { kind: 'select', value: 'accept' },
    ]);
    const io = memoryIO();
    const result = await runPhase(miniPhase(), freshSession(), {
      prompter,
      analyse: fakeAnalyse([{ status: 'ok', value: ready() }]).fn,
      synthesise: fakeSynthesise([{ status: 'degraded', reason: 'schema failed twice' }]).fn,
      io,
      now: CLOCK,
      save: memorySave().save,
    });
    const body = io.files.get('01-MINI.md') ?? '';
    expect(body).toContain('degraded: true');
    // Degraded artifacts carry the FULL standard frontmatter (§9.7), not a stub.
    expect(body).toContain('generated_by: mustard');
    expect(body).toContain('session_id:');
    expect(body).toContain(`generated_at: ${CLOCK()}`);
    expect(body).toContain('m.name'); // raw answers rendered under headings
    expect(body).toContain('My App');
    expect(phaseOf(result).synthesisedObject).toBeUndefined();
    expect(phaseOf(result).status).toBe('accepted');
  });
});

describe('runPhase — resume mid-review', () => {
  const twoArtifacts = () =>
    miniPhase({
      synthesis: { pass: 'synth-mini', model: 'deep', artifacts: ['01-MINI.md', '01-EXTRA.md'] },
    });
  const twoArtifactOutcome: LlmOutcome<{
    object: unknown;
    artifacts: { name: string; body: string }[];
  }> = {
    status: 'ok',
    value: {
      object: { v: 1 },
      artifacts: [
        { name: '01-MINI.md', body: 'ONE' },
        { name: '01-EXTRA.md', body: 'TWO' },
      ],
    },
  };

  it('does not re-synthesise and preserves an already-edited artifact', async () => {
    // Run 1: edit artifact 1, then Ctrl-C at artifact 2's review gate.
    const cancelling = new ScriptedPrompter([
      { kind: 'text', value: 'X' },
      { kind: 'select', value: 'a' },
      { kind: 'select', value: 'edit' }, // 01-MINI.md → edited and written
      CANCEL, // Ctrl-C at 01-EXTRA.md's gate
    ]);
    const { save, snapshots } = memorySave();
    const io = memoryIO();
    const synth = fakeSynthesise([twoArtifactOutcome]);
    const deps = {
      analyse: fakeAnalyse([{ status: 'ok', value: ready() }]).fn,
      synthesise: synth.fn,
      io,
      editor: { launch: async () => 'HAND-EDITED' },
      now: CLOCK,
      save,
    };

    await expect(
      runPhase(twoArtifacts(), freshSession(), { prompter: cancelling, ...deps }),
    ).rejects.toBeInstanceOf(PromptCancelledError);
    expect(io.files.get('01-MINI.md')).toBe('HAND-EDITED');

    const crashed = snapshots.at(-1);
    if (crashed === undefined) {
      throw new Error('expected a persisted snapshot before the cancel');
    }
    // The per-artifact review outcome was persisted before the cancel.
    expect(phaseOf(crashed).pendingSynthesis?.reviewed).toEqual([
      { name: '01-MINI.md', edited: true },
    ]);

    // Run 2: resume — only artifact 2 is reviewed; no second SYNTHESISE call.
    const resuming = new ScriptedPrompter([{ kind: 'select', value: 'accept' }]);
    const result = await runPhase(twoArtifacts(), crashed, { ...deps, prompter: resuming });

    expect(synth.steerings).toHaveLength(1); // synthesised exactly once across both runs
    expect(io.files.get('01-MINI.md')).toBe('HAND-EDITED'); // the edit survived the resume
    expect(io.files.get('01-EXTRA.md')).toBe('TWO');
    const ps = phaseOf(result);
    expect(ps.status).toBe('accepted');
    expect(ps.edited).toBe(true);
    expect(ps.artifactPaths).toEqual(['01-MINI.md', '01-EXTRA.md']);
    expect(ps.synthesisedObject).toEqual({ v: 1 });
    expect(ps.pendingSynthesis).toBeUndefined(); // cleared on acceptance
  });

  it('re-synthesises after an edit when a later artifact is redone', async () => {
    const prompter = new ScriptedPrompter([
      { kind: 'text', value: 'X' },
      { kind: 'select', value: 'a' },
      { kind: 'select', value: 'edit' }, // 01-MINI.md (first synthesis)
      { kind: 'select', value: 'redo-detail' }, // 01-EXTRA.md → regenerate everything
      { kind: 'select', value: 'accept' }, // 01-MINI.md (second synthesis)
      { kind: 'select', value: 'accept' }, // 01-EXTRA.md (second synthesis)
    ]);
    const io = memoryIO();
    const second: typeof twoArtifactOutcome = {
      status: 'ok',
      value: {
        object: { v: 2 },
        artifacts: [
          { name: '01-MINI.md', body: 'ONE-2' },
          { name: '01-EXTRA.md', body: 'TWO-2' },
        ],
      },
    };
    const synth = fakeSynthesise([twoArtifactOutcome, second]);
    const result = await runPhase(twoArtifacts(), freshSession(), {
      prompter,
      analyse: fakeAnalyse([{ status: 'ok', value: ready() }]).fn,
      synthesise: synth.fn,
      io,
      editor: { launch: async () => 'HAND-EDITED' },
      now: CLOCK,
      save: memorySave().save,
    });

    expect(synth.steerings).toEqual([undefined, 'detail']);
    // The redo regenerated BOTH artifacts; the pre-redo edit is superseded.
    expect(io.files.get('01-MINI.md')).toBe('ONE-2');
    expect(io.files.get('01-EXTRA.md')).toBe('TWO-2');
    const ps = phaseOf(result);
    expect(ps.edited).toBe(false); // the accepted synthesis was not edited
    expect(ps.synthesisedObject).toEqual({ v: 2 });
  });
});

describe('runPhase — resume', () => {
  it('resumes at the exact next question after a Ctrl-C, without duplicating answers', async () => {
    // First run cancels on the second seed question.
    const cancelling = new ScriptedPrompter([{ kind: 'text', value: 'My App' }, CANCEL]);
    const { save, snapshots } = memorySave();
    const deps = {
      analyse: fakeAnalyse([{ status: 'ok', value: ready() }]).fn,
      synthesise: fakeSynthesise([
        {
          status: 'ok',
          value: { object: { ok: true }, artifacts: [{ name: '01-MINI.md', body: 'B' }] },
        },
      ]).fn,
      io: memoryIO(),
      now: CLOCK,
      save,
    };

    await expect(
      runPhase(miniPhase(), freshSession(), { prompter: cancelling, ...deps }),
    ).rejects.toBeInstanceOf(PromptCancelledError);

    // The last persisted snapshot holds the first answer but not the cancelled one.
    const crashed = snapshots.at(-1);
    if (crashed === undefined) {
      throw new Error('expected a persisted snapshot before the cancel');
    }
    expect(answersFrom(crashed, 'seed')).toEqual(['m.name']);

    // Resume with a fresh prompter that only answers what remains.
    const resuming = new ScriptedPrompter([
      { kind: 'select', value: 'a' }, // m.mode — the question we cancelled on
      { kind: 'select', value: 'accept' },
    ]);
    const io2 = memoryIO();
    const result = await runPhase(miniPhase(), crashed, {
      ...deps,
      prompter: resuming,
      io: io2,
      save,
    });

    expect(phaseOf(result).status).toBe('accepted');
    // m.name answered exactly once across both runs — no duplication.
    expect(answersFrom(result, 'seed')).toEqual(['m.name', 'm.mode']);
    expect(io2.files.get('01-MINI.md')).toBe('B');
  });
});
