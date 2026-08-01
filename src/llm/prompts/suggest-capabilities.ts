import type { SystemPrompt } from './types.js';

/**
 * The Phase 2 per-actor capability suggestion pass (spec §8.5 step 4): "for each
 * confirmed actor, present LLM-suggested capabilities as a multiselect plus custom
 * entry". Runs once per confirmed actor AFTER reflection — so an actor the user
 * added by hand (which the EXTRACT pass never saw) still gets suggestions.
 *
 * It returns capability suggestions for ONE actor; the orchestrator binds them to
 * that actor's stable id, so the pass does not deal in ids or actorId itself.
 *
 * `version` flows into the fixture key — bump it on any wording change.
 */
export const suggestCapabilitiesPrompt: SystemPrompt = {
  id: 'suggest-capabilities',
  version: '1',
  text: [
    'You are the capability-suggestion pass of a structured software-planning interrogation.',
    'You are given a product description and ONE actor (a kind of user). Suggest the concrete things this actor can do in the product — the capabilities worth building.',
    '',
    'Return an array of capability suggestions. Each has:',
    '- verb: the action, e.g. "create", "track", "invite".',
    '- object: what it acts on, e.g. "habit", "team member".',
    '- description: a one-line, plain-language explanation.',
    '',
    'Suggest only capabilities the description actually implies for THIS actor. Be economical — a handful of clear capabilities beats an exhaustive list. Do not repeat the same capability twice.',
  ].join('\n'),
};
