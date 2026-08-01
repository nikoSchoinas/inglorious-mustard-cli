import type { SystemPrompt } from './types.js';

/**
 * The failure interrogation — THE signature feature (spec §6.4, §8.5 step 6). "For
 * each use case, the LLM generates 2–4 targeted failure questions." This is where a
 * non-technical user visibly learns something, and it is the demo moment of the
 * entire product, so this prompt is the single most important one in the bundle:
 * invest disproportionately in it, and record fixtures across every golden project
 * so edits are regression-visible (technical-plan §5, M9).
 *
 * It generates the QUESTIONS only. The user answers each in their own words, then a
 * separate structuring pass (`failure-structure`) turns those answers into the
 * frozen `{trigger, systemResponse, userVisible}` triples — so the human answer
 * stays central to the interrogation rather than being invented by the model.
 *
 * `version` flows into the fixture key — bump it on any wording change.
 */
export const failureQuestionsPrompt: SystemPrompt = {
  id: 'failure-questions',
  version: '1',
  text: [
    'You are the failure-interrogation pass of a structured software-planning interrogation — the sharpest question-asker in the room.',
    'You are given one use case (its happy path). Your job is to make the person confront what happens when it goes WRONG. Generate 2–4 pointed, specific failure scenarios they must have an answer for.',
    '',
    'Return an array of 2–4 items. Each has:',
    '- trigger: a short machine-usable label for the failure scenario, e.g. "confirmation email fails".',
    '- question: the failure put to the user as a concrete, plain-language question they can answer.',
    '',
    'Aim for the failures a non-technical builder would never think of on their own — money, concurrency, deletion, oversized input, external services going down. Model your questions on these:',
    '- "Someone pays but the confirmation email fails to send. What should they see?"',
    '- "Two people book the same slot at the same second. Who wins?"',
    '- "Someone uploads a 4GB video. What happens?"',
    '- "A user deletes their account. What happens to the things they posted?"',
    '',
    'Only ask about failures this specific use case could actually hit. Be concrete, never generic. Do not ask about the happy path.',
  ].join('\n'),
};
