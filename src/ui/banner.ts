import { PRODUCT_NAME, SLOGAN } from '../branding.js';
import type { Prompter } from './prompter.js';

/**
 * The mission banner (spec §6.3 voice, §9.1 dossier aesthetic). `renderBanner`
 * is pure so it snapshot-tests cleanly; `showBanner` prints it through a
 * `Prompter` (or stdout) at the start of a session.
 */

/**
 * Draw a box sized to its content. Every content line is padded to the widest
 * line's width, so the borders always line up — no overflow regardless of the
 * text (counted by code point, since the borders are single-width glyphs).
 */
function box(lines: readonly string[]): string {
  const width = Math.max(...lines.map((line) => [...line].length));
  const rule = '─'.repeat(width + 2);
  const body = lines.map((line) => `│ ${line}${' '.repeat(width - [...line].length)} │`);
  return [`┌${rule}┐`, ...body, `└${rule}┘`].join('\n');
}

export function renderBanner(): string {
  return box([PRODUCT_NAME, SLOGAN]);
}

/** Print the banner. Uses `prompter.note` when given, else stdout. */
export function showBanner(prompter?: Prompter): void {
  const banner = renderBanner();
  if (prompter) {
    prompter.note(banner);
  } else {
    process.stdout.write(`${banner}\n`);
  }
}
