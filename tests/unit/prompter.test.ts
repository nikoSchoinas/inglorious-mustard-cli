import { describe, expect, it } from 'vitest';
import { ClackPrompter } from '../../src/ui/clack-prompter.js';
import {
  ANSWER_DELIMITER,
  type EditorLauncher,
  buildEditorBuffer,
  extractAnswer,
} from '../../src/ui/editor.js';
import { PromptCancelledError, type Validate } from '../../src/ui/prompter.js';
import {
  CANCEL,
  ScriptExhaustedError,
  ScriptTypeMismatchError,
  ScriptedPrompter,
  ScriptedValidationError,
} from '../../src/ui/scripted-prompter.js';

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('ScriptedPrompter drives every prompt type', () => {
  it('returns the scripted value for each method with the correct type', async () => {
    const p = new ScriptedPrompter([
      { kind: 'select', value: 'a' },
      { kind: 'multiselect', value: ['a', 'b'] },
      { kind: 'text', value: 'hello' },
      { kind: 'editor', value: 'a longer answer' },
      { kind: 'confirm', value: true },
    ]);

    expect(await p.select({ message: 'pick', options: OPTIONS })).toBe('a');
    expect(await p.multiselect({ message: 'pick many', options: OPTIONS })).toEqual(['a', 'b']);
    expect(await p.text({ message: 'name' })).toBe('hello');
    expect(await p.editor({ message: 'why' })).toBe('a longer answer');
    expect(await p.confirm({ message: 'sure?' })).toBe(true);
  });

  it('captures note output for snapshotting', () => {
    const p = new ScriptedPrompter([]);
    p.note('body text', 'A Title');
    p.note('untitled');
    expect(p.notes).toEqual([{ message: 'body text', title: 'A Title' }, { message: 'untitled' }]);
  });

  it('throws when the script is exhausted', async () => {
    const p = new ScriptedPrompter([]);
    await expect(p.select({ message: 'x', options: OPTIONS })).rejects.toBeInstanceOf(
      ScriptExhaustedError,
    );
  });

  it('throws on a prompt-kind mismatch', async () => {
    const p = new ScriptedPrompter([{ kind: 'text', value: 'oops' }]);
    await expect(p.select({ message: 'x', options: OPTIONS })).rejects.toBeInstanceOf(
      ScriptTypeMismatchError,
    );
  });
});

describe('editor buffer seeds the question and strips it back out', () => {
  it('buildEditorBuffer comments the message/help above the delimiter, answer below', () => {
    const buffer = buildEditorBuffer({ message: 'Why?', help: 'A few sentences.', initial: 'seed' });
    const lines = buffer.split('\n');
    const delimiter = lines.indexOf(ANSWER_DELIMITER);
    expect(lines[0]).toBe('# Why?');
    expect(lines[1]).toBe('# A few sentences.');
    expect(delimiter).toBeGreaterThan(1);
    // Everything above the delimiter is commented; the answer sits below it.
    expect(lines.slice(0, delimiter).every((l) => l.startsWith('# '))).toBe(true);
    expect(lines.slice(delimiter + 1).join('\n')).toBe('seed');
  });

  it('buildEditorBuffer includes a validation error line when re-prompting', () => {
    const buffer = buildEditorBuffer({ message: 'Why?', error: 'Please write at least 30 words.' });
    expect(buffer).toContain('# Please write at least 30 words.');
    expect(buffer.indexOf('# Please')).toBeLessThan(buffer.indexOf(ANSWER_DELIMITER));
  });

  it('extractAnswer returns only the text after the delimiter, preserving # headings', () => {
    const buffer = `# Why?\n${ANSWER_DELIMITER}\n# My heading\n\nBecause reasons.`;
    expect(extractAnswer(buffer)).toBe('# My heading\n\nBecause reasons.');
  });

  it('extractAnswer falls back to dropping leading comment lines if the delimiter is gone', () => {
    const buffer = '# Why?\n# A few sentences.\nBecause reasons.';
    expect(extractAnswer(buffer)).toBe('Because reasons.');
  });

  it('round-trips through an injected EditorLauncher (no real $EDITOR)', async () => {
    // The launcher receives the full seeded buffer; the answer is appended below
    // the delimiter, and ClackPrompter strips the header back out.
    const launcher: EditorLauncher = {
      launch: async (buffer) => `${buffer}my answer`,
    };
    const p = new ClackPrompter({ launcher });
    expect(await p.editor({ message: 'Why?', help: 'A few sentences.' })).toBe('my answer');
  });
});

describe('validators are enforced', () => {
  const minWords: Validate = (v) =>
    v.trim().split(/\s+/).filter(Boolean).length >= 3
      ? undefined
      : 'Please write at least 3 words.';

  it('accepts a scripted answer that satisfies validate', async () => {
    const p = new ScriptedPrompter([{ kind: 'text', value: 'one two three' }]);
    expect(await p.text({ message: 'q', validate: minWords })).toBe('one two three');
  });

  it('rejects a scripted answer that fails validate, surfacing the message', async () => {
    const p = new ScriptedPrompter([{ kind: 'editor', value: 'too short' }]);
    await expect(p.editor({ message: 'q', validate: minWords })).rejects.toThrow(
      ScriptedValidationError,
    );
    await expect(
      new ScriptedPrompter([{ kind: 'editor', value: 'too short' }]).editor({
        message: 'q',
        validate: minWords,
      }),
    ).rejects.toThrow(/at least 3 words/);
  });
});

describe('a cancel step models Ctrl-C', () => {
  it('throws PromptCancelledError regardless of the prompt method', async () => {
    await expect(
      new ScriptedPrompter([CANCEL]).select({ message: 'x', options: OPTIONS }),
    ).rejects.toBeInstanceOf(PromptCancelledError);
    await expect(new ScriptedPrompter([CANCEL]).confirm({ message: 'x' })).rejects.toBeInstanceOf(
      PromptCancelledError,
    );
  });
});
