import { pc } from './color.js';

/**
 * A tiny loading indicator for the long silences while an LLM call is in flight
 * (spec §9.8: calls block for tens of seconds with no feedback). Like Claude
 * Code's spinner it animates a glyph, shows a playful word, and — crucially —
 * erases itself when the call settles, leaving no residue between prompts.
 *
 * It renders on a single line via carriage-return, so it must only run when
 * stdout is an interactive TTY. The wiring keeps `LLMClient` UI-agnostic: the
 * client only knows an `onActivityStart` callback that returns a stop function
 * (client.ts). Production hands it `startMustardSpinner` through `activityHook`;
 * tests and non-TTY / replay runs omit it, so nothing is drawn.
 */

/** Mustard-flavoured gerunds — one is shown at a time, cycled while we wait. */
export const MUSTARD_WORDS = [
  'Mustarding',
  'Dijoning',
  'Grinding',
  'Slathering',
  'Marinating',
  'Emulsifying',
  'Whisking',
  'Simmering',
  'Macerating',
  'Zesting',
  'Seasoning',
] as const;

/** Braille spinner frames — the glyph that "moves" while we wait. */
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

const FRAME_INTERVAL_MS = 80;
/** How often the word swaps to a fresh one (counted in frame ticks, ≈ 1.2s). */
const WORD_EVERY_FRAMES = 15;

/** Pick a random mustard word. */
export function pickMustardWord(): string {
  return MUSTARD_WORDS[Math.floor(Math.random() * MUSTARD_WORDS.length)] as string;
}

const ESC = String.fromCharCode(27);
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_LINE = `\r${ESC}[2K`;

/**
 * Start the mustard spinner. Returns a stop function that clears the line and
 * restores the cursor. A no-op (and draws nothing) when stdout isn't a TTY, so
 * it's always safe to call. The stop function is idempotent.
 */
export function startMustardSpinner(): () => void {
  const out = process.stdout;
  if (!out.isTTY) {
    return () => {};
  }

  let frame = 0;
  let word = pickMustardWord();

  const render = (): void => {
    out.write(`${CLEAR_LINE}${pc.yellow(FRAMES[frame % FRAMES.length] as string)} ${word}…`);
  };

  out.write(HIDE_CURSOR);
  render();
  const timer = setInterval(() => {
    frame += 1;
    if (frame % WORD_EVERY_FRAMES === 0) {
      word = pickMustardWord();
    }
    render();
  }, FRAME_INTERVAL_MS);
  timer.unref?.();

  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(timer);
    out.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
  };
}
