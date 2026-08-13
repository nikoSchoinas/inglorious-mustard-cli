import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Abstracts spawning `$EDITOR` for long-form (`editor`) answers. Behind an
 * interface so tests inject content instead of opening a real editor — the M3
 * risk flagged in the technical plan. `@clack/prompts` has no native editor
 * primitive, so the real `Prompter.editor` delegates here.
 */
export interface EditorLauncher {
  /** Open an editor seeded with `initial`; resolve with the saved buffer. */
  launch(initial: string): Promise<string>;
}

/**
 * Separates the commented prompt header from the answer body inside the editor
 * buffer. The editor takes over the terminal's alternate screen, so any prompt
 * printed *before* launch is wiped — the question must live in the buffer. We
 * split on this delimiter (not on `# ` prefixes) so answers may freely contain
 * Markdown `#` headings without being eaten.
 */
export const ANSWER_DELIMITER =
  '# ──── write your answer below this line ────';

/** Prefix a block of (possibly multi-line) text as `# ` comment lines. */
function commentLines(text: string): string[] {
  return text.split('\n').map((line) => `# ${line}`);
}

/**
 * Build the seed buffer shown in the editor: the question (and help, and any
 * validation error) as commented header lines above {@link ANSWER_DELIMITER},
 * then the current answer. Pure — unit-tested without spawning an editor.
 */
export function buildEditorBuffer(spec: {
  message: string;
  help?: string;
  initial?: string;
  error?: string;
}): string {
  const header = [...commentLines(spec.message)];
  if (spec.help) {
    header.push(...commentLines(spec.help));
  }
  if (spec.error) {
    header.push(...commentLines(spec.error));
  }
  header.push(ANSWER_DELIMITER);
  return `${header.join('\n')}\n${spec.initial ?? ''}`;
}

/**
 * Recover the answer from a saved buffer: everything after the last
 * {@link ANSWER_DELIMITER}, trimmed. If the delimiter is gone (the user deleted
 * it), fall back to dropping leading `# ` comment lines so no typed text is lost.
 */
export function extractAnswer(buffer: string): string {
  const marker = buffer.lastIndexOf(ANSWER_DELIMITER);
  if (marker !== -1) {
    return buffer.slice(marker + ANSWER_DELIMITER.length).trim();
  }
  const lines = buffer.split('\n');
  let start = 0;
  while (lines[start]?.startsWith('# ')) {
    start += 1;
  }
  return lines.slice(start).join('\n').trim();
}

/**
 * Spawns the user's editor on a temp file and returns its contents. Resolution
 * order: `$VISUAL` → `$EDITOR` → `vi`. stdio is inherited so the editor owns the
 * terminal; the temp file is always cleaned up.
 */
export const defaultEditorLauncher: EditorLauncher = {
  async launch(initial: string): Promise<string> {
    const editor = process.env.VISUAL ?? process.env.EDITOR ?? 'vi';
    const dir = mkdtempSync(join(tmpdir(), 'mustard-'));
    const file = join(dir, 'ANSWER.md');
    try {
      writeFileSync(file, initial, 'utf8');
      const result = spawnSync(editor, [file], { stdio: 'inherit' });
      if (result.error) {
        throw result.error;
      }
      return readFileSync(file, 'utf8');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
