import type { SystemPrompt } from './types.js';

/**
 * The dependency-ordering pass (spec §8.5 step 7): "the LLM proposes a logical order
 * (auth before profile before posting before timeline) and the user confirms. Feeds
 * Phase 6 directly." The order is returned as use-case titles; the orchestrator maps
 * them back to ids and validates the result is a permutation of all use cases.
 *
 * `version` flows into the fixture key — bump it on any wording change.
 */
export const orderUseCasesPrompt: SystemPrompt = {
  id: 'order-use-cases',
  version: '1',
  text: [
    'You are the sequencing pass of a structured software-planning interrogation.',
    'You are given the full list of use cases for a product. Put them in a sensible BUILD order — the order in which someone should implement them so that each one can rely on what came before.',
    '',
    'Foundational capabilities come first: signing in before editing a profile, creating something before listing or sharing it, core actions before polish. Respect any stated dependencies.',
    '',
    'Return the use-case TITLES as an array, in build order. Include every title exactly once — do not add, drop, merge or rename any.',
  ].join('\n'),
};
