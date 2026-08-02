import { runPhase7 } from '../../src/engine/phase-7.js';
import type { RunnerIO } from '../../src/engine/runner.js';
import { type AdapterIO, memoryAdapterIO } from '../../src/render/adapters/io.js';
import type { MustardSession } from '../../src/schemas/session.js';
import type { Task } from '../../src/schemas/task.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { CLOCK } from './phase1-skeleton.js';
import { memoryIO } from './phase2b-fixture.js';
import { VERSION } from './phase5-fixture.js';
import { CANNED_SEQUENCE, ORDERED_TASK_IDS, phase6StartSession } from './phase6-fixture.js';

/**
 * Shared definition for Phase 7 (M13), golden project #1 continued. Phase 7 has no LLM
 * passes — it is pure generation — so there are no fixtures to record: a scripted prompter
 * (one bundle-level confirm) and in-memory IO are enough. The start session is the Phase 6
 * end state: Phases 0–6 accepted with `session.tasks` populated in dependency order.
 */

/** The roadmap tasks in their deterministically-ordered form (status stamped `todo`). */
export const ORDERED_TASKS: Task[] = [...ORDERED_TASK_IDS].map((id) => {
  const task = CANNED_SEQUENCE.tasks.find((t) => t.id === id);
  if (task === undefined) {
    throw new Error(`missing canned task ${id}`);
  }
  return { ...task, status: 'todo' };
});

/** Accept the whole bundle. */
export const FULL_7_SCRIPT: ScriptedStep[] = [{ kind: 'confirm', value: true }];

/** Decline at the bundle gate — nothing should be written. */
export const DECLINE_7_SCRIPT: ScriptedStep[] = [{ kind: 'confirm', value: false }];

/** Cancel (Ctrl-C) at the bundle gate. */
export const CANCEL_7_SCRIPT: ScriptedStep[] = [{ kind: 'cancel' }];

/** A session sitting at the start of Phase 7: Phases 0–6 accepted, tasks sequenced. */
export function phase7StartSession(): MustardSession {
  const base = phase6StartSession();
  const ts = CLOCK();
  return {
    ...base,
    currentPhase: 7,
    phases: [
      ...base.phases,
      {
        id: 6,
        status: 'accepted',
        answers: [],
        followUpsAsked: 0,
        analysisRuns: 0,
        artifactPaths: ['06-ROADMAP.md'],
        edited: false,
        acceptedAt: ts,
      },
    ],
    tasks: ORDERED_TASKS,
  };
}

/** Run Phase 7 with a scripted prompter and in-memory IO for both `mustard/` and the repo root. */
export async function runPhase7Scripted(opts: {
  script: ScriptedStep[];
  session?: MustardSession;
  save?: (s: MustardSession) => MustardSession;
  io?: RunnerIO;
  adapterIo?: AdapterIO & { files: Map<string, string> };
}): Promise<{
  session: MustardSession;
  prompter: ScriptedPrompter;
  writes: Array<{ name: string; body: string }>;
  adapterFiles: Map<string, string>;
}> {
  const prompter = new ScriptedPrompter(opts.script);
  const mem = memoryIO();
  const io = opts.io ?? mem.io;
  const adapterIo = opts.adapterIo ?? memoryAdapterIO();
  const save = opts.save ?? ((s: MustardSession) => s);
  const session = await runPhase7(opts.session ?? phase7StartSession(), {
    prompter,
    io,
    adapterIo,
    now: CLOCK,
    save,
    mustardVersion: VERSION,
  });
  return { session, prompter, writes: opts.io ? [] : mem.writes, adapterFiles: adapterIo.files };
}
