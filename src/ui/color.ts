import picocolors from 'picocolors';

/**
 * Central colour toggle so `--no-color` (declared globally in cli.ts) has one
 * place to flip. Everything in `src/ui/` imports `pc` from here rather than
 * picocolors directly; because `pc` is a live `let` binding, reconfiguring it
 * propagates to every consumer.
 *
 * Default: picocolors' own auto-detection (respects `NO_COLOR`, `FORCE_COLOR`,
 * TTY). M6 calls `configureColor` once from the resolved `--no-color` flag.
 */
type Pc = ReturnType<typeof picocolors.createColors>;

// `let`, not `const`: reassigned by configureColor. The ESM live binding means
// consumers importing `pc` see the reconfigured value.
export let pc: Pc = picocolors;

/** Force colour off (`--no-color`), or restore environment-detected colour. */
export function configureColor(noColor: boolean): void {
  pc = picocolors.createColors(noColor ? false : picocolors.isColorSupported);
}
