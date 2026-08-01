import type { Prompter } from './prompter.js';

/**
 * The review-gate component (spec §8.2 step 5). It owns the display+select
 * interaction and returns the user's choice; the M5 runner
 * (`engine/runner.ts`) orchestrates what each choice means — `edit` via the
 * editor launcher, `redo-*` via a re-run of SYNTHESISE with steering. Every
 * generated artifact passes through here before it is written — the line that
 * separates MUSTARD from vibe coding (§7.3.2).
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
