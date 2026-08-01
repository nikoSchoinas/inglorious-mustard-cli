import type { Prompter } from './prompter.js';

/**
 * The review-gate component — a STUB for M3 (spec §8.2 step 5). It fixes the
 * choice enum and the display+select interface now; wiring `edit` to the editor
 * launcher and the `redo-*` choices to re-synthesis is M5's job. Every generated
 * artifact passes through here before it is written — the line that separates
 * MUSTARD from vibe coding (§7.3.2).
 */
export type ReviewChoice = 'accept' | 'edit' | 'redo-detail' | 'redo-differently';

const CHOICES: ReadonlyArray<{ value: ReviewChoice; label: string }> = [
  { value: 'accept', label: 'Accept — write it and move on' },
  { value: 'edit', label: 'Edit in $EDITOR' },
  { value: 'redo-detail', label: 'Redo with more detail' },
  { value: 'redo-differently', label: 'Redo answering differently' },
];

/** Show an artifact and ask the user what to do with it. */
export async function reviewGate(
  prompter: Prompter,
  artifact: { title: string; body: string },
): Promise<ReviewChoice> {
  prompter.note(artifact.body, artifact.title);
  const choice = await prompter.select({
    message: 'How does this look?',
    options: CHOICES,
  });
  return choice as ReviewChoice;
}
