import { describe, expect, it } from 'vitest';
import { IdAllocator, mermaidId, mermaidLabel } from '../../src/render/mermaid/id.js';

describe('mermaidId — hostile names', () => {
  const cases: Array<[string, string]> = [
    ['Order', 'Order'],
    ['User Profile', 'User_Profile'],
    ['end', 'end_'], // reserved word
    ['Subgraph', 'Subgraph_'], // reserved, case-insensitive
    ['3D Model', 'n_3D_Model'], // leading digit
    ['42', 'n_42'],
    ['café ☕', 'cafe'], // unicode strip + trailing punctuation trimmed
    ['a/b (c) [d]', 'a_b_c_d'],
    ['My App!', 'My_App'],
    ['  spaced  ', 'spaced'],
    ['résumé', 'resume'],
  ];

  for (const [raw, expected] of cases) {
    it(`sanitizes ${JSON.stringify(raw)} → ${expected}`, () => {
      expect(mermaidId(raw)).toBe(expected);
    });
  }

  it('always starts with a letter or underscore', () => {
    for (const raw of ['3', '!!!', '', '   ', '99 bottles', '_leading']) {
      expect(mermaidId(raw)).toMatch(/^[A-Za-z_]/);
    }
  });

  it('never returns an empty id', () => {
    for (const raw of ['', '   ', '!!!', '☃', '\n\t']) {
      expect(mermaidId(raw).length).toBeGreaterThan(0);
    }
  });

  it('handles a very long name without throwing', () => {
    const long = 'a'.repeat(300);
    expect(mermaidId(long)).toBe(long);
  });
});

describe('IdAllocator — collisions', () => {
  it('gives distinct ids to names that sanitize identically', () => {
    const alloc = new IdAllocator();
    expect(alloc.id('My App!')).toBe('My_App');
    expect(alloc.id('My App?')).toBe('My_App_2');
    expect(alloc.id('My App#')).toBe('My_App_3');
  });

  it('returns the same id when the same name is requested twice', () => {
    const alloc = new IdAllocator();
    const first = alloc.id('User Profile');
    expect(alloc.id('User Profile')).toBe(first);
  });
});

describe('mermaidLabel', () => {
  it('escapes quotes and brackets, preserves unicode and spaces', () => {
    expect(mermaidLabel('café ☕')).toBe('café ☕');
    expect(mermaidLabel('say "hi"')).toBe('say #quot;hi#quot;');
    expect(mermaidLabel('a [b] {c} (d)')).toBe('a #91;b#93; #123;c#125; #40;d#41;');
  });

  it('collapses newlines into spaces', () => {
    expect(mermaidLabel('line1\nline2')).toBe('line1 line2');
  });
});
