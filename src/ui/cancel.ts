import { PromptCancelledError } from './prompter.js';

/**
 * The Ctrl-C / cancel path (spec §9.8: "answers already on disk; print
 * `mustard resume`; exit 0"). Two sources — a clack cancel surfaced as a
 * `PromptCancelledError`, and a process `SIGINT` — funnel through one exit so
 * both behave identically.
 *
 * Decoupled from persistence by design (technical-plan: M3 depends on M0 only):
 * the caller injects `onFlush`; M5/M6 register the real session flush there.
 * Because answers persist at submit-time (M5), `onFlush` is a best-effort final
 * touch, not the thing that saves the work.
 */

const DEFAULT_HINT = 'Progress saved. Run `mustard resume` to pick up where you left off.';

export interface CancelOptions {
  /** Best-effort flush hook the engine registers (e.g. persist in-memory state). */
  onFlush?: () => void;
  /** Message printed on exit. Defaults to the `mustard resume` hint. */
  resumeHint?: string;
  /** Injectable so tests assert the code without terminating the runner. */
  exit?: (code: number) => never;
  /** Injectable output sink; defaults to stdout. */
  print?: (message: string) => void;
}

/** Flush, print the resume hint, exit 0 — the single clean-exit funnel. */
function finish(opts: CancelOptions): never {
  opts.onFlush?.();
  const print = opts.print ?? ((m: string) => console.log(`\n${m}`));
  print(opts.resumeHint ?? DEFAULT_HINT);
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  return exit(0);
}

/**
 * For the runner's try/catch: if `err` is a `PromptCancelledError`, take the
 * clean-exit path; otherwise rethrow so real failures still propagate.
 */
export function handleCancellation(err: unknown, opts: CancelOptions = {}): never {
  if (!(err instanceof PromptCancelledError)) {
    throw err;
  }
  return finish(opts);
}

/**
 * Register a `SIGINT` handler that takes the same clean-exit path. Returns a
 * disposer that removes the listener (call it once the phase completes normally).
 */
export function installCancelHandler(opts: CancelOptions = {}): () => void {
  const listener = (): void => {
    finish(opts);
  };
  process.on('SIGINT', listener);
  return () => {
    process.off('SIGINT', listener);
  };
}
