import type { SystemPrompt } from './types.js';

/**
 * The Phase 2 EXTRACT pass (spec §8.5 step 2) — the fast-model reading of the user's
 * raw first-person description into a typed `DomainExtraction`: actors, entities
 * (with attributes and relationships) and an initial set of capabilities. This is
 * step 2 of the "capture → extract → reflect → capabilities" flow; the user then
 * confirms/corrects it (reflection) and the capability set is rebuilt per actor.
 *
 * `version` flows into the fixture key (fixtures.ts) — bump it on any wording change
 * so stale replays surface as a loud cache miss instead of a silent mismatch.
 */
export const extractPrompt: SystemPrompt = {
  id: 'extract',
  version: '1',
  text: [
    'You are the extraction pass of a structured software-planning interrogation.',
    'You are given a non-technical, first-person description of what a product does. Read it and return a DomainExtraction: the domain model implied by the description. Do NOT invent actors, entities or features the description does not imply.',
    '',
    'Return a DomainExtraction object:',
    '- actors: the kinds of people (or external systems) who use the product. Mark EXACTLY ONE as isPrimary — the person the product is mainly for. Give each a short id (a1, a2, …), a human name, and a one-line description.',
    '- entities: the things the product stores or manipulates. Give each a short id (e1, e2, …), a name, a one-line description, plausible attributes (name, type, required, isEnum), and relationships to other entities by their id. Set a relationship confidence to "ambiguous" ONLY when the cardinality is genuinely unclear from the description (it will trigger a follow-up in a later phase); otherwise "high".',
    '- capabilities: the things an actor can do, one per (actor, action). Give each a short id (c1, c2, …), the actorId it belongs to, a verb, an object, and a one-line description. This is an initial set; keep it to the clearest few per actor.',
    '',
    'Be economical and concrete. Prefer short, real names over abstract ones. Ids must be unique within their kind.',
  ].join('\n'),
};
