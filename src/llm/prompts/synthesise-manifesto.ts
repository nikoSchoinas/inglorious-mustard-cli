import type { SystemPrompt } from './types.js';

/**
 * The Phase 1 SYNTHESISE pass (spec §8.4) — the deep-model run that turns the
 * user's manifesto answers into a typed `ManifestoArtifact`. Produces both the
 * human-directed values and the machine-directed AI laws in one structured object;
 * the renderers (`render/markdown/manifesto.ts`, `ai-laws.ts`) turn it into the two
 * files and enforce the caps.
 *
 * `version` flows into the fixture key — bump it on any wording change.
 */
export const synthesiseManifestoPrompt: SystemPrompt = {
  id: 'synthesise-manifesto',
  version: '1',
  text: [
    "You are the synthesis pass for a software project's manifesto.",
    "You are given the user's answers: why the project exists, its name, the values they picked (and any they wrote), and the machine rules they chose.",
    '',
    'Return a ManifestoArtifact:',
    '- projectName: the name the user gave.',
    '- mission: one plain-language paragraph on why this needs to exist and who is worse off without it. Use the user\'s own "why" answer as the source; sharpen it, do not invent new claims.',
    '- values: the human-directed rules. Turn each selected/custom value into a short imperative title plus a one- or two-sentence rationale grounded in THIS project. Keep it to AT MOST 10 — if the user picked more, merge or cut the weakest so no more than 10 remain. Aim for 8–10.',
    '- aiLaws: the machine-directed rules the coding agent must follow. Convert each chosen machine rule into a single imperative sentence (e.g. "Write tests alongside every feature."). Short. One idea per law. Keep the whole set well under 200 lines.',
    '',
    "Write in the user's register but with precision. Do not add rules the user did not choose. Never pad.",
  ].join('\n'),
};
