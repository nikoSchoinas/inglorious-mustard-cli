import type { Phase } from '../types.js';

/**
 * Phase 6 — Roadmap (spec §8.9). By now the whole product is specified: use cases
 * and their build order (Phase 2), the data model (Phase 3), the stack (Phase 4),
 * the architecture (Phase 5). Phase 6 asks only the TWO things none of that can
 * tell us — how much time the builder has, and how much they want to test — then
 * the deep `sequence` pass chunks and sizes the work into agent-sized tasks while
 * DETERMINISTIC code owns the dependency ordering (technical-plan §5, M13).
 *
 * Both answers `mapsTo` a `roadmap.*` fact the `sequence` pass reads. "none" is a
 * legitimate, honestly-recorded testing option (§8.9) — the tool never shames the
 * user into a policy they will not follow.
 *
 * Unlike the mostly-derived Phase 5, Phase 6 runs the full generic-shaped round
 * (SEED → ANALYSE → capped FOLLOW-UP → SYNTHESISE → REVIEW → WRITE) in its bespoke
 * orchestrator (`engine/phase-6.ts`) — the sequencer benefits from the analysis
 * pass catching a missing constraint (e.g. a hard deadline) before it sizes tasks.
 * Emits `06-ROADMAP.md`; the ordered task list is also written to `session.tasks`
 * for Phase 7 and `mustard prompts` to consume.
 */
export const phase6: Phase = {
  phase: 6,
  name: 'Roadmap',
  seed: [
    {
      id: 'p6.hours-per-week',
      type: 'select',
      mapsTo: 'roadmap.hoursPerWeek',
      prompt: {
        none: 'Honestly, how much time can you give this each week?',
        some: 'How many hours per week do you have for this?',
        developer: 'Weekly time budget?',
      },
      help: 'This sizes the tasks. Small, frequent chunks for a few hours a week; larger ones if this is your full-time focus.',
      options: [
        { value: 'under-5', label: 'Under 5 hours — evenings and weekends' },
        { value: '5-15', label: '5 to 15 hours' },
        { value: '15-30', label: '15 to 30 hours' },
        { value: 'full-time', label: "Full time — it's my main focus" },
      ],
    },
    {
      id: 'p6.testing-policy',
      type: 'select',
      mapsTo: 'roadmap.testingPolicy',
      prompt: {
        none: 'How much do you want to test as you build? There is no wrong answer.',
        some: 'What testing policy do you want?',
        developer: 'Testing policy?',
      },
      help: 'Tests cost time now and save it later. Testing only the critical paths (payments, auth) is a common middle ground.',
      options: [
        { value: 'none', label: "None — I'll move fast and check by hand" },
        { value: 'critical', label: 'Critical paths only — the parts that must not break' },
        { value: 'every-feature', label: 'Tests alongside every feature' },
        { value: 'tdd', label: 'Test-driven — tests before the code' },
      ],
    },
  ],
  followUpPolicy: { maxGenerated: 2, onlySeverity: ['blocking', 'important'] },
  synthesis: {
    pass: 'sequence',
    model: 'deep',
    artifacts: ['06-ROADMAP.md'],
  },
};
