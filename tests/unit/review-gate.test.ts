import { describe, expect, it } from 'vitest';
import { type ReviewChoice, reviewGate } from '../../src/ui/review-gate.js';
import { ScriptedPrompter } from '../../src/ui/scripted-prompter.js';

const artifact = { title: '01-MANIFESTO.md', body: '# Manifesto\n\n- Ship before perfect.' };

describe('reviewGate', () => {
  it('resolves to whichever choice the user selects', async () => {
    const choices: ReviewChoice[] = ['accept', 'edit', 'redo-detail', 'redo-differently'];
    for (const choice of choices) {
      const p = new ScriptedPrompter([{ kind: 'select', value: choice }]);
      expect(await reviewGate(p, artifact)).toBe(choice);
    }
  });

  it('displays the artifact body under its title before asking', async () => {
    const p = new ScriptedPrompter([{ kind: 'select', value: 'accept' }]);
    await reviewGate(p, artifact);
    expect(p.notes).toContainEqual({ message: artifact.body, title: artifact.title });
  });
});
