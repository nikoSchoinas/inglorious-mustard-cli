import type { Phase } from '../types.js';

/**
 * Phase 3 — Structure & Schemas (spec §8.6), "translation mode". Most of the data model
 * is *derived* from the Phase 2 entities, so this module is deliberately thin: the only
 * declarative seed question is the single global soft-delete / retention select. The
 * dynamic gaps — disambiguating `ambiguous` relationship cardinality and discovering the
 * values of `isEnum` attributes — are bespoke *flow* in `engine/phase-3.ts`, because
 * their count depends on the extraction at runtime, not a static seed set. That flow
 * still reads every question STRING from here or a pure template; no question text lives
 * in the engine (technical-plan §5; the M2 tripwire holds).
 *
 * `synthesis.artifacts` lists `03-SCHEMAS.md` ONLY. `03-STRUCTURE.md` keeps its Phase 3
 * number but is a Phase 4 output (§8.6/§8.7, pitfall §7.1) — encoding the deferral here
 * is what a negative test after Phase 3 guards. The render is deterministic, so the
 * `pass`/`model` fields are declarative (no generic synthesise pass runs); the
 * orchestrator reads only `artifacts`.
 */
export const phase3: Phase = {
  phase: 3,
  name: 'Schemas',
  seed: [
    {
      // §8.6: "When someone deletes something, should it be recoverable?" One global
      // decision. Values match the `Retention` enum (schemas/schema-model.ts).
      id: 'p3.retention',
      type: 'select',
      mapsTo: 'data.retention',
      prompt: {
        none: 'When someone deletes something, should they be able to get it back later?',
        some: 'When a record is deleted, should it be recoverable?',
        developer: 'Delete semantics — soft delete, archive, or hard delete?',
      },
      help: 'Soft delete keeps a hidden copy you can restore; hard delete removes it for good.',
      options: [
        { value: 'recoverable', label: 'Yes — keep it and allow it to be restored (soft delete)' },
        { value: 'archived', label: 'Keep it, but hidden and not restorable in-app (archive)' },
        { value: 'hard_delete', label: 'No — remove it permanently (hard delete)' },
      ],
    },
  ],
  // Phase 3 has no ANALYSE/follow-up loop (bespoke flow replaces it); declared for parity.
  followUpPolicy: { maxGenerated: 0, onlySeverity: [] },
  synthesis: {
    pass: 'derive-schemas',
    model: 'fast',
    artifacts: ['03-SCHEMAS.md'],
  },
};
