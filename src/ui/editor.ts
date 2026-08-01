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
