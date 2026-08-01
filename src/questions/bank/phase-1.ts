import { fact } from '../fact.js';
import type { Phase } from '../types.js';

/**
 * Phase 1 — Manifesto (spec §8.4). Values and team rules → `01-MANIFESTO.md`
 * (human-directed) and `01-AI-LAWS.md` (machine-directed).
 *
 * SCOPE (M2 vs M6): this is a structurally complete *scaffold* that exercises
 * the whole pipeline (editor with validation, text, multiselect, a conditional
 * editor, a machine-rules multiselect, and a deep-model synthesis pass). The
 * FULL book-seeded content — the ~15 canonical candidate rules, the exact
 * machine-rule set, and the vagueness-check follow-up phrasing — is filled in
 * during M6. Keep the representative options below in sync with the book then.
 */
export const phase1: Phase = {
  phase: 1,
  name: 'Manifesto',
  seed: [
    {
      id: 'p1.why',
      type: 'editor',
      mapsTo: 'manifesto.why',
      prompt: {
        none: "Why does this need to exist, and who is worse off if it doesn't?",
        some: 'Why does this need to exist, and who is worse off without it?',
        developer: 'Problem statement: why build this, and who is underserved without it?',
      },
      help: 'A few sentences. Write for a person, not a pitch deck.',
      validation: { minWords: 30 },
    },
    {
      id: 'p1.name',
      type: 'text',
      mapsTo: 'projectName',
      prompt: {
        none: 'What do you want to call this? A working name is fine.',
        some: 'Project name or codename?',
        developer: 'Project name / codename?',
      },
    },
    {
      id: 'p1.rules',
      type: 'multiselect',
      mapsTo: 'manifesto.rules',
      prompt: {
        none: 'Which of these should be rules your project lives by? Pick the ones that matter to you.',
        some: 'Which team rules should apply?',
        developer: 'Select the guiding rules for this project.',
      },
      help: 'These become your manifesto. You can add your own on the next step.',
      // Representative subset — the full ~15 book-seeded rules land in M6.
      options: [
        { value: 'stay-true-to-users', label: 'Stay true to your users' },
        { value: 'ship-before-perfect', label: 'Ship before perfect' },
        { value: 'document-or-it-didnt-happen', label: "Document it or it doesn't exist" },
        {
          value: 'dont-instruct-ai-blindly',
          label: "Don't instruct AI about problems you don't understand",
        },
        { value: 'write-my-own', label: 'Write my own' },
      ],
    },
    {
      id: 'p1.custom-rules',
      type: 'editor',
      mapsTo: 'manifesto.customRules',
      // Only ask when the user asked to write their own on the previous question.
      when: (facts) => {
        const rules = fact(facts, 'manifesto.rules');
        return Array.isArray(rules) && rules.includes('write-my-own');
      },
      prompt: {
        none: 'Write your own rules, one per line.',
        developer: 'Custom rules, one per line.',
      },
      validation: { linesAsList: true },
    },
    {
      id: 'p1.machine-rules',
      type: 'multiselect',
      mapsTo: 'manifesto.machineRules',
      prompt: {
        none: 'Which of these should the AI agent always follow when it writes code for you?',
        some: 'Which machine rules should the agent enforce?',
        developer: 'Machine-directed rules to enforce:',
      },
      // Representative subset — finalised against the book in M6.
      options: [
        { value: 'docstrings-mandatory', label: 'Docstrings mandatory' },
        { value: 'tests-alongside-features', label: 'Tests alongside features' },
        { value: 'no-unrequested-md', label: 'No unrequested .md files' },
        { value: 'conventional-commits', label: 'Conventional commits' },
        { value: 'typed-everywhere', label: 'Typed everywhere' },
        { value: 'no-new-dependency-without-asking', label: 'No new dependency without asking' },
      ],
    },
  ],
  followUpPolicy: { maxGenerated: 5, onlySeverity: ['blocking', 'important'] },
  synthesis: {
    pass: 'synthesise-manifesto',
    model: 'deep',
    artifacts: ['01-MANIFESTO.md', '01-AI-LAWS.md'],
  },
};
