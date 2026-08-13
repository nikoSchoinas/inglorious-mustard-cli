import type { Phase } from '../types.js';

/**
 * Phase 2 — Use Cases & UI (spec §8.5), the heaviest phase. This module holds the
 * declarative seed questions: the raw first-person capture that feeds the EXTRACT
 * pass, and the UI design-approach select asked in part B's step 8. Everything else —
 * extraction, the "here's what I heard, correct me" reflection, the per-actor
 * capability loop (part A), and the happy-path / failure interrogation / dependency
 * ordering / screen inventory (part B) — is bespoke *flow* code in
 * `engine/phase-2a.ts` and `engine/phase-2b.ts`, not the generic `runPhase` machine,
 * because Phase 2 does not fit SEED → ANALYSE → FOLLOW-UP → SYNTHESISE → REVIEW →
 * WRITE. That flow code still reads every question *string* from here or from a
 * versioned prompt; no question text lives in the engine (technical-plan §5; M2 tripwire).
 *
 * There is no `synthesis` field: part B renders `02-USE-CASES.md` deterministically
 * from the confirmed interrogation data (via the renderer registry), never through an
 * LLM synthesis pass (§7.3.4). The screen-inventory multiselect and the review gate
 * are driven by the orchestrator, not the bank, as their options derive from the
 * use cases at runtime.
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
    },
    {
      // Part B, step 8 (§8.5): how the user intends to approach the UI. Asked here so
      // the question string stays declarative; the screen inventory that follows is
      // derived from the use cases at runtime, so it lives in the orchestrator.
      id: 'p2.ui.approach',
      type: 'select',
      mapsTo: 'ui.approach',
      prompt: {
        none: 'How do you want to design the screens?',
        some: 'How will you approach the UI?',
        developer: 'UI approach?',
      },
      help: 'Just the starting point — you can change your mind later.',
      options: [
        { value: 'sketch', label: 'Sketch the screens first (paper or a tool like Figma)' },
        { value: 'component-library', label: 'Use a component library (e.g. shadcn, MUI)' },
        { value: 'ai-ui', label: 'Generate a first pass with an AI UI tool (e.g. v0)' },
        { value: 'none', label: 'No plan yet — decide later' },
      ],
    },
  ],
  // Follow-ups are not used by part A (the reflection loop replaces the ANALYSE gap
  // loop), but the policy is declared for parity and for M9's part-B synthesis.
  followUpPolicy: { maxGenerated: 5, onlySeverity: ['blocking', 'important'] },
};
