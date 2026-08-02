import { describe, expect, it } from 'vitest';
import {
  BEGIN,
  CorruptSentinelError,
  END,
  mergeSentinel,
} from '../../src/render/adapters/sentinel.js';

/**
 * The adapter sentinel merge (spec §9.7, technical-plan §M13 acceptance): the four
 * cases that guarantee regeneration never clobbers hand-written sections of a
 * CLAUDE.md / AGENTS.md.
 */
describe('mergeSentinel', () => {
  it('(a) wraps generated content when there is no existing file', () => {
    const out = mergeSentinel(undefined, 'rule one\nrule two');
    expect(out).toBe(`${BEGIN}\nrule one\nrule two\n${END}\n`);
  });

  it('(b) preserves hand-written content above and below the region byte-for-byte', () => {
    const existing = [
      '# My project',
      'Hand-written intro the user cares about.',
      '',
      BEGIN,
      'old generated text',
      END,
      '',
      '## My own notes',
      'Do not touch these.',
    ].join('\n');
    const out = mergeSentinel(existing, 'fresh generated text');
    // The user's prose above and below is unchanged; only the region body swaps.
    expect(out).toContain('# My project\nHand-written intro the user cares about.');
    expect(out).toContain('## My own notes\nDo not touch these.');
    expect(out).toContain(`${BEGIN}\nfresh generated text\n${END}`);
    expect(out).not.toContain('old generated text');
  });

  it('(c) is a zero diff when run twice with the same content', () => {
    const first = mergeSentinel(undefined, 'body');
    const second = mergeSentinel(first, 'body');
    expect(second).toBe(first);

    // Also idempotent after an append into a hand-written file.
    const withProse = mergeSentinel('# Title\n\nsome prose', 'body');
    expect(mergeSentinel(withProse, 'body')).toBe(withProse);
  });

  it('(d) errors safely on a corrupt file with only a BEGIN sentinel', () => {
    const corrupt = `# Title\n${BEGIN}\nhalf a region, no end`;
    expect(() => mergeSentinel(corrupt, 'body')).toThrow(CorruptSentinelError);
  });

  it('errors on an END-before-BEGIN ordering and on duplicate markers', () => {
    expect(() => mergeSentinel(`${END}\nx\n${BEGIN}`, 'body')).toThrow(CorruptSentinelError);
    expect(() => mergeSentinel(`${BEGIN}\na\n${END}\n${BEGIN}\nb\n${END}`, 'body')).toThrow(
      CorruptSentinelError,
    );
  });

  it('appends the region into an existing file that has no markers', () => {
    const out = mergeSentinel('# Title\n\nprose', 'body');
    expect(out).toBe(`# Title\n\nprose\n\n${BEGIN}\nbody\n${END}\n`);
  });
});
