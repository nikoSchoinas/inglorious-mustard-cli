import type { Phase } from '../types.js';

/**
 * Phase 0 — Recon (spec §8.3). Sits *outside* the M-U-S-T-A-R-D acronym: it
 * establishes IDE/tooling choice and the global `literacy` register before the
 * seven phases begin. Nearly LLM-free — no synthesis pass.
 *
 * NOTE: question 0.5 (API-key capture + connectivity check + telemetry
 * consent) is deliberately NOT modelled here. It is a special engine step
 * (M4 connectivity + M6 init flow), not a declarative `Question`.
 */
export const phase0: Phase = {
  phase: 0,
  name: 'Recon',
  seed: [
    {
      id: 'p0.literacy',
      type: 'select',
      mapsTo: 'literacy',
      prompt: {
        none: 'How much have you built before?',
        some: 'How much coding experience do you have?',
        developer: 'Coding background?',
      },
      help: 'This tunes how the rest of the questions are phrased. There is no wrong answer.',
      options: [
        { value: 'none', label: 'Never written code' },
        { value: 'some', label: "Some — I've used AI builders or can read code" },
        { value: 'developer', label: "I'm a developer" },
      ],
    },
    {
      id: 'p0.project-type',
      type: 'select',
      mapsTo: 'project.type',
      prompt: {
        none: 'Are you starting something brand new, or working on a project that already exists?',
        some: 'Is this a fresh start or an existing project?',
        developer: 'Greenfield or brownfield?',
      },
      help: 'Existing projects are not supported yet — MUSTARD will continue as if starting fresh.',
      options: [
        { value: 'greenfield', label: 'Brand new — nothing built yet' },
        { value: 'brownfield', label: 'It already exists (not yet supported — continues as new)' },
      ],
    },
    {
      id: 'p0.agent-target',
      type: 'select',
      mapsTo: 'agent.target',
      prompt: {
        none: 'Which AI coding assistant will you use to build this?',
        some: 'Which AI coding agent will you use?',
        developer: 'Target coding agent?',
      },
      help: 'MUSTARD writes setup files tuned to your agent. Pick "undecided" if you are not sure yet.',
      options: [
        { value: 'claude-code', label: 'Claude Code' },
        { value: 'codex', label: 'Codex' },
        { value: 'cursor', label: 'Cursor' },
        { value: 'copilot', label: 'Copilot' },
        { value: 'gemini-cli', label: 'Gemini CLI' },
        { value: 'antigravity', label: 'Antigravity' },
        { value: 'other', label: 'Other' },
        { value: 'undecided', label: 'Undecided' },
      ],
    },
    {
      id: 'p0.provider',
      type: 'select',
      mapsTo: 'provider',
      prompt: {
        none: 'Which AI service should MUSTARD itself use to ask you questions?',
        some: 'Which model provider will MUSTARD use?',
        developer: 'Provider for MUSTARD’s own inference?',
      },
      help: 'You bring your own key. You can run fully local and free via Ollama.',
      options: [
        { value: 'anthropic', label: 'Anthropic (Claude)' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'google', label: 'Google (Gemini)' },
        { value: 'ollama', label: 'Local models via Ollama' },
      ],
    },
  ],
  followUpPolicy: { maxGenerated: 0, onlySeverity: [] },
  // No `synthesis`: Recon produces no artifact of its own.
};
