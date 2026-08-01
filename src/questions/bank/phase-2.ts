import type { Phase } from '../types.js';

/**
 * Phase 2 — Use Cases & UI (spec §8.5), the heaviest phase. This module holds only
 * the ONE declarative seed question: the raw first-person capture that feeds the
 * EXTRACT pass. Everything after it — extraction, the "here's what I heard, correct
 * me" reflection, and the per-actor capability loop — is bespoke *flow* code in
 * `engine/phase-2a.ts`, not the generic `runPhase` machine, because Phase 2 does not
 * fit SEED → ANALYSE → FOLLOW-UP → SYNTHESISE → REVIEW → WRITE. That flow code still
 * reads every question *string* from here or from a versioned prompt; no question
 * text lives in the engine (technical-plan §5, M8; the M2 tripwire).
 *
 * M8 (part A) stops at a confirmed `DomainExtraction` in `PhaseState.synthesisedObject`
 * — no artifact is written. M9 (part B) adds the happy-path / failure interrogation,
 * dependency ordering and UI steps, and only then the `synthesis` field and
 * `02-USE-CASES.md`. So there is deliberately no `synthesis` here yet.
 */
export const phase2: Phase = {
  phase: 2,
  name: 'Use Cases & UI',
  seed: [
    {
      id: 'p2.capture',
      type: 'editor',
      // No `mapsTo`: the answer feeds the EXTRACT pass, not the facts store
      // (types.ts Question.mapsTo — "absent for raw-capture editors").
      prompt: {
        none: "Walk me through what someone does with this, start to finish, the first time they use it. Plain language — don't worry about being technical.",
        some: 'Walk me through a first-time user’s journey with this, start to finish.',
        developer: 'Describe the primary end-to-end user flow on first use.',
      },
      help: "Just tell the story. We'll pull out the actors and moving parts for you.",
      validation: { minWords: 30 },
    },
  ],
  // Follow-ups are not used by part A (the reflection loop replaces the ANALYSE gap
  // loop), but the policy is declared for parity and for M9's part-B synthesis.
  followUpPolicy: { maxGenerated: 5, onlySeverity: ['blocking', 'important'] },
};
