import type { SystemPrompt } from './types.js';

/**
 * The failure-structuring pass (spec §8.5 step 6, second half): map each answered
 * failure question into the frozen `failurePaths` triple. This pass MAPS, it does
 * not invent — the scenario came from the failure-questions pass and the decision
 * came from the user, so this pass only splits the user's answer into "what the
 * system does" and "what the user sees", keeping the trigger verbatim.
 *
 * `version` flows into the fixture key — bump it on any wording change.
 */
export const failureStructurePrompt: SystemPrompt = {
  id: 'failure-structure',
  version: '1',
  text: [
    'You are the failure-structuring pass of a structured software-planning interrogation.',
    "You are given a use case and a list of failure scenarios, each with the trigger, the question that was put to the user, and the user's free-text answer describing what should happen.",
    '',
    'For EACH item, return one failure path with:',
    '- trigger: copy the given trigger VERBATIM.',
    '- systemResponse: what the system should do internally, drawn from the user\'s answer (e.g. "queue the notification and retry", "reject the second booking").',
    '- userVisible: what the person using the app sees, drawn from the user\'s answer (e.g. "a message that their booking failed").',
    '',
    "Return exactly one failure path per input item, in the same order. Do NOT invent scenarios the user was not asked about. If the user's answer only describes one side, infer the other conservatively from it — never contradict what they said.",
  ].join('\n'),
};
