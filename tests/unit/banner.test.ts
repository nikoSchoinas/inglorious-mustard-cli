import { describe, expect, it } from 'vitest';
import { renderBanner, showBanner } from '../../src/ui/banner.js';
import { ScriptedPrompter } from '../../src/ui/scripted-prompter.js';

describe('banner', () => {
  it('renders a deterministic banner', () => {
    expect(renderBanner()).toMatchSnapshot();
  });

  it('prints through a Prompter when given one', () => {
    const p = new ScriptedPrompter([]);
    showBanner(p);
    expect(p.notes).toEqual([{ message: renderBanner() }]);
  });
});
