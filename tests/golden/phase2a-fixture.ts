import { runPhase2A } from '../../src/engine/phase-2a.js';
import { buildPasses } from '../../src/llm/passes/index.js';
import type { SuggestedCapability } from '../../src/llm/passes/suggest-capabilities.js';
import type { LLMTransport } from '../../src/llm/transport.js';
import type { DomainExtraction } from '../../src/schemas/extraction.js';
import type { MustardSession } from '../../src/schemas/session.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { CLOCK, CONFIG } from './phase1-skeleton.js';

/**
 * Shared definition for Phase 2A (M8), golden project #1 continued. One place holds
 * the raw-capture answer, the canned EXTRACT and per-actor suggest responses, and the
 * scripted corrections — imported by both the fixture recorder (`record-phase2.ts`)
 * and the integration test (`tests/unit/phase2a.test.ts`), so record and replay
 * compute identical fixture keys.
 */

/** The raw first-person capture (≥ 30 words, so it passes the bank validator). */
export const CAPTURE =
  'A member opens the app, creates a habit they want to build like meditating every ' +
  'morning, and each day they check in to mark it done. Over time they look back at ' +
  'their streak to see how consistent they have been and stay motivated to continue.';

/** Canned EXTRACT — two actors (one removed in reflection) and two entities. */
export const CANNED_EXTRACT: DomainExtraction = {
  actors: [
    { id: 'a1', name: 'Member', description: 'Someone building a daily habit', isPrimary: true },
    {
      id: 'a2',
      name: 'Coach',
      description: "Someone reviewing a member's progress",
      isPrimary: false,
    },
  ],
  entities: [
    {
      id: 'e1',
      name: 'Habit',
      description: 'A habit being tracked',
      attributes: [{ name: 'title', type: 'string', required: true, isEnum: false }],
      relationships: [{ toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' }],
    },
    {
      id: 'e2',
      name: 'CheckIn',
      description: 'A daily completion record',
      attributes: [{ name: 'date', type: 'date', required: true, isEnum: false }],
      relationships: [],
    },
  ],
  capabilities: [
    {
      id: 'c1',
      actorId: 'a1',
      verb: 'create',
      object: 'Habit',
      description: 'add a habit to track',
    },
  ],
};

/** Canned per-actor suggestions for the confirmed actor (Member). */
export const CANNED_CAPS_MEMBER: SuggestedCapability[] = [
  { verb: 'create', object: 'habit', description: 'start tracking a new habit' },
  { verb: 'check in', object: 'habit', description: 'mark a habit done for the day' },
];

/**
 * The full scripted run: capture → reflection (remove the Coach actor, add a Streak
 * entity) → capability loop for Member (accept both suggestions + one custom entry).
 */
export const FULL_SCRIPT: ScriptedStep[] = [
  { kind: 'editor', value: CAPTURE }, // p2.capture
  { kind: 'multiselect', value: ['a2'] }, // remove actors → drop Coach
  { kind: 'text', value: '' }, // add actors → none
  { kind: 'multiselect', value: [] }, // remove entities → none
  { kind: 'text', value: 'Streak' }, // add entities → Streak (e3)
  { kind: 'multiselect', value: ['0', '1'] }, // Member capabilities → accept both suggestions
  { kind: 'text', value: 'set a reminder' }, // Member custom capability
];

/** Cancel at the first reflection prompt (after EXTRACT has run and persisted). */
export const CANCEL_SCRIPT: ScriptedStep[] = [
  { kind: 'editor', value: CAPTURE },
  { kind: 'cancel' }, // Ctrl-C at the "remove actors" multiselect
];

/** The remaining answers on resume — identical values, so nothing re-calls the LLM. */
export const RESUME_SCRIPT: ScriptedStep[] = [
  { kind: 'multiselect', value: ['a2'] },
  { kind: 'text', value: '' },
  { kind: 'multiselect', value: [] },
  { kind: 'text', value: 'Streak' },
  { kind: 'multiselect', value: ['0', '1'] },
  { kind: 'text', value: 'set a reminder' },
];

/** A session with Phases 0 and 1 accepted, sitting at the start of Phase 2. */
export function phase2StartSession(): MustardSession {
  const ts = CLOCK();
  return {
    schemaVersion: 1,
    projectName: 'Habit Tracker',
    literacy: 'some',
    agentTarget: 'claude-code',
    currentPhase: 2,
    phases: [
      {
        id: 0,
        status: 'accepted',
        answers: [],
        followUpsAsked: 0,
        analysisRuns: 0,
        artifactPaths: [],
        edited: false,
        acceptedAt: ts,
      },
      {
        id: 1,
        status: 'accepted',
        answers: [],
        followUpsAsked: 0,
        analysisRuns: 0,
        artifactPaths: ['01-MANIFESTO.md', '01-AI-LAWS.md'],
        edited: false,
        acceptedAt: ts,
      },
    ],
    facts: {},
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Build the two Phase 2 passes over a caller-supplied transport (record or replay). */
export function phase2Passes(transport: LLMTransport): {
  extract: ReturnType<typeof buildPasses>['extract'];
  suggestCapabilities: ReturnType<typeof buildPasses>['suggestCapabilities'];
} {
  const passes = buildPasses(CONFIG, { transport, apiKey: 'dummy', now: CLOCK });
  return { extract: passes.extract, suggestCapabilities: passes.suggestCapabilities };
}

/** Run Phase 2A with a scripted prompter over the given transport. */
export async function runPhase2AScripted(opts: {
  transport: LLMTransport;
  script: ScriptedStep[];
  session?: MustardSession;
  save?: (s: MustardSession) => MustardSession;
}): Promise<{ session: MustardSession; prompter: ScriptedPrompter }> {
  const prompter = new ScriptedPrompter(opts.script);
  const { extract, suggestCapabilities } = phase2Passes(opts.transport);
  // Default to an in-memory save so tests never write into the repo's `mustard/` dir;
  // the runner threads `current` through its return, so identity persistence is enough.
  const save = opts.save ?? ((s: MustardSession) => s);
  const session = await runPhase2A(opts.session ?? phase2StartSession(), {
    prompter,
    extract,
    suggestCapabilities,
    now: CLOCK,
    save,
  });
  return { session, prompter };
}
