import type { SystemPrompt } from './types.js';

/**
 * The Phase 4 "explain more" pass (spec §8.7: the review offers `explain more` on
 * a proposed `StackDecision`). A cheap fast-tier elaboration — the user wants a
 * bit more before accepting a choice, not a new proposal.
 *
 * `version` flows into the fixture key — bump it on any wording change.
 */
export const explainStackPrompt: SystemPrompt = {
  id: 'explain-stack',
  version: '1',
  text: [
    'You are the "explain more" pass of a structured software-planning interrogation.',
    'You are given one proposed technology decision — the chosen technology, its justification, its two alternatives, and the product context.',
    'The user wants to understand it better before accepting.',
    '',
    'Return a short plain-language elaboration (2–4 sentences) that helps a non-technical builder decide: what this technology actually does for them, the one situation where the chosen option clearly wins, and the one situation where an alternative would be the better call.',
    'Do not restate the justification verbatim. Do not use jargon without immediately explaining it. Do not propose a new technology — explain the ones already on the table.',
  ].join('\n'),
};
