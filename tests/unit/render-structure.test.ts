import { describe, expect, it } from 'vitest';
import type { FrontmatterMeta } from '../../src/render/markdown/frontmatter.js';
import { renderStructure } from '../../src/render/markdown/structure.js';
import type { Phase4Output } from '../../src/schemas/stack.js';
import type { FolderTree } from '../../src/schemas/structure.js';

/**
 * M11: a stable `03-STRUCTURE.md` folder-tree snapshot, plus hostile names — a stray
 * newline in a model-supplied name would break the box-drawing tree (the same class of
 * silent breaker guarded for Mermaid in M7). Frontmatter meta is injected with a fixed
 * clock so the render is deterministic.
 */

const META: FrontmatterMeta = {
  phase: 4,
  sessionId: 'testsession01',
  generatedAt: '2026-08-01T00:00:00.000Z',
  mustardVersion: '0.0.0-test',
};

function wrap(structure: FolderTree): Phase4Output {
  return { decisions: [], structure };
}

describe('renderStructure', () => {
  it('snapshots a nested 03-STRUCTURE.md tree', () => {
    const tree: FolderTree = [
      {
        name: 'src',
        kind: 'dir',
        description: 'App code',
        children: [
          { name: 'index.ts', kind: 'file' },
          {
            name: 'components',
            kind: 'dir',
            children: [{ name: 'Button.tsx', kind: 'file' }],
          },
        ],
      },
      { name: 'package.json', kind: 'file', description: 'Dependencies' },
    ];
    expect(renderStructure(wrap(tree), META)).toMatchSnapshot();
  });

  it('collapses newlines and tabs in a hostile name to a single line', () => {
    const tree: FolderTree = [{ name: 'ev\nil\tdir', kind: 'dir', description: 'line\nbreak' }];
    const md = renderStructure(wrap(tree), META);
    expect(md).toContain('ev il dir/  # line break');
    // The tree is not broken across extra lines by the hostile input.
    expect(md).not.toMatch(/\n\s*il\b/);
  });

  it('renders the empty-structure fallback', () => {
    const md = renderStructure(wrap([]), META);
    expect(md).toContain('_No folder structure was proposed._');
  });
});
