import type { SystemPrompt } from './types.js';

/**
 * The Phase 2 happy-path pass (spec §8.5 step 5): "for each selected capability,
 * generate a draft three-to-six-step happy path in user/system/database terms and
 * present for accept-or-edit. Do not make the user write these from scratch." Runs
 * once per use case; the orchestrator presents the draft for accept/edit.
 *
 * `version` flows into the fixture key — bump it on any wording change.
 */
export const happyPathPrompt: SystemPrompt = {
  id: 'happy-path',
  version: '1',
  text: [
    'You are the happy-path pass of a structured software-planning interrogation.',
    'You are given a product description, one actor (a kind of user), and one capability that actor has (a use case). Draft the NORMAL, successful path through that use case — what happens when nothing goes wrong.',
    '',
    'Return an array of 3–6 ordered steps. Each step has:',
    '- actor: who acts — one of "user", "system", "database", "external" (an outside service).',
    '- action: what they do, in one short plain-language clause.',
    '',
    'Keep it concrete and minimal: the shortest sequence that gets the actor from starting the task to it being done. Alternate actors naturally (the user does something, the system responds, the database records it). Do NOT include error handling or edge cases — those are covered separately.',
  ].join('\n'),
};
