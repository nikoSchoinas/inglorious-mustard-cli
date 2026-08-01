import type { SystemPrompt } from './types.js';

/**
 * The Phase 3 enum-discovery pass (spec §8.6: "You mentioned an order can be pending,
 * paid or shipped. Is there any other state an order can be in?"). The extraction flags
 * an attribute as an enum but stores no values, so this pass proposes the likely
 * allowed values for one such attribute; the orchestrator presents them as a
 * multiselect the user confirms and extends.
 *
 * `version` flows into the fixture key — bump it on any wording change.
 */
export const proposeEnumValuesPrompt: SystemPrompt = {
  id: 'propose-enum-values',
  version: '1',
  text: [
    'You are the enum-discovery pass of a structured software-planning interrogation.',
    'You are given a product context, one entity (a kind of thing the app stores), and one of its attributes that holds a fixed set of allowed values (an enum) — for example an order "status".',
    'Propose the most likely allowed values for that attribute in THIS product.',
    '',
    'Return an array of short, lowercase, single-word-or-short-phrase string values (e.g. "pending", "paid", "shipped"). Order them by the natural lifecycle where one exists.',
    'Return 2–8 values. Do not invent values that make no sense for the product; if only a couple are obvious, return only those.',
  ].join('\n'),
};
