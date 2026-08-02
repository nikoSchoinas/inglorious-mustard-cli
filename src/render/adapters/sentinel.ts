/**
 * Sentinel-based idempotent merge for the agent adapter files (spec §9.7). MUSTARD
 * owns only the region between the markers; anything the user hand-wrote above or
 * below it survives byte-for-byte, and regenerating is always a zero diff. Pure —
 * no filesystem — so the four cases (fresh / has-region / no-region / corrupt) are
 * unit-testable in isolation (technical-plan pitfall §7.3, and the first thing M13
 * builds).
 */

export const BEGIN = '<!-- MUSTARD:BEGIN -->';
export const END = '<!-- MUSTARD:END -->';

/** A file with exactly one of the two sentinels — we refuse to guess where the region is. */
export class CorruptSentinelError extends Error {
  constructor(readonly detail: string) {
    super(`Adapter file has a corrupt MUSTARD region: ${detail}`);
    this.name = 'CorruptSentinelError';
  }
}

/**
 * Merge `generated` into `existing`, returning the whole new file contents.
 *
 *  - `existing` absent/empty → the wrapped block alone.
 *  - a well-formed region present → its contents are replaced, the text before and
 *    after preserved exactly (idempotent: same input → identical bytes).
 *  - no region present → the block is appended, existing content preserved exactly.
 *  - exactly one marker, markers out of order, or duplicated markers → throw
 *    `CorruptSentinelError` (never clobber a file we cannot safely reason about).
 */
export function mergeSentinel(existing: string | undefined, generated: string): string {
  const block = `${BEGIN}\n${generated.trimEnd()}\n${END}`;

  if (existing === undefined || existing.trim() === '') {
    return `${block}\n`;
  }

  const begins = countOccurrences(existing, BEGIN);
  const ends = countOccurrences(existing, END);

  if (begins === 0 && ends === 0) {
    // No region yet — append the block, preserving the existing bytes.
    return `${existing.trimEnd()}\n\n${block}\n`;
  }

  if (begins !== 1 || ends !== 1) {
    throw new CorruptSentinelError(
      `expected one ${BEGIN} and one ${END}, found ${begins} and ${ends}`,
    );
  }

  const beginIdx = existing.indexOf(BEGIN);
  const endIdx = existing.indexOf(END);
  if (endIdx < beginIdx) {
    throw new CorruptSentinelError(`${END} appears before ${BEGIN}`);
  }

  const before = existing.slice(0, beginIdx);
  const after = existing.slice(endIdx + END.length);
  return `${before}${block}${after}`;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) {
      return count;
    }
    count += 1;
    from = idx + needle.length;
  }
}
