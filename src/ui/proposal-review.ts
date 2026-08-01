import type { StackDecision } from '../schemas/stack.js';
import type { Prompter } from './prompter.js';

/**
 * The Phase 4 proposal-review component (spec §8.7). Unlike the generic
 * full-artifact `reviewGate`, a stack proposal is reviewed ONE `StackDecision` at
 * a time: the user can accept it, swap in one of the two alternatives, ask for
 * more explanation, or override it with a technology they already decided on.
 *
 * This component owns only the display+prompt interaction and returns the user's
 * intent; `runPhase4` (engine/phase-4.ts) decides what each intent means —
 * `explain-more` triggers the `explain-stack` pass and re-asks, `already-decided`
 * locks the override so it survives any redo (§8.7).
 */
export type ProposalChoice = 'accept' | 'choose-alternative' | 'explain-more' | 'already-decided';

export interface ProposalDecision {
  choice: ProposalChoice;
  /** Set when `choice === 'choose-alternative'`: the picked alternative's name. */
  alternative?: string;
  /** Set when `choice === 'already-decided'`: the technology the user chose instead. */
  override?: string;
}

const CHOICES: ReadonlyArray<{ value: ProposalChoice; label: string }> = [
  { value: 'accept', label: 'Accept — use this' },
  { value: 'choose-alternative', label: 'Use one of the alternatives instead' },
  { value: 'explain-more', label: 'Explain more' },
  { value: 'already-decided', label: "I already decided — it's something else" },
];

/** Render one stack decision for the user, as a plain-language block. */
function renderDecision(decision: StackDecision): string {
  const alts = decision.alternatives.map((a) => `  • ${a.name} — ${a.tradeoff}`).join('\n');
  return [`Choice: ${decision.choice}`, '', decision.justification, '', 'Alternatives:', alts].join(
    '\n',
  );
}

/**
 * Show one proposed decision and ask what to do with it. `explain-more` returns
 * immediately so the caller can fetch and display an elaboration, then call again
 * for the same decision.
 */
export async function reviewProposal(
  prompter: Prompter,
  decision: StackDecision,
): Promise<ProposalDecision> {
  prompter.note(renderDecision(decision), `${decision.category}: ${decision.choice}`);
  const choice = (await prompter.select({
    message: 'How does this look?',
    options: CHOICES,
  })) as ProposalChoice;

  if (choice === 'choose-alternative') {
    const alternative = await prompter.select({
      message: 'Which alternative do you want to use?',
      options: decision.alternatives.map((a) => ({
        value: a.name,
        label: `${a.name} — ${a.tradeoff}`,
      })),
    });
    return { choice, alternative };
  }

  if (choice === 'already-decided') {
    const override = await prompter.text({
      message: `What did you decide to use for ${decision.category}?`,
    });
    return { choice, override };
  }

  return { choice };
}
