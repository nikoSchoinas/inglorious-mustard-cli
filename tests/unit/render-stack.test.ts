import { describe, expect, it } from 'vitest';
import type { FrontmatterMeta } from '../../src/render/markdown/frontmatter.js';
import { renderStack } from '../../src/render/markdown/stack.js';
import type { Phase4Output } from '../../src/schemas/stack.js';

/**
 * M11: a stable `04-STACK.md` snapshot, the locked-decision marker, hostile-cell
 * escaping in the summary table, and the empty-decisions fallback. Frontmatter meta is
 * injected with a fixed clock so the render is deterministic.
 */

const META: FrontmatterMeta = {
  phase: 4,
  sessionId: 'testsession01',
  generatedAt: '2026-08-01T00:00:00.000Z',
  mustardVersion: '0.0.0-test',
};

function output(): Phase4Output {
  return {
    decisions: [
      {
        componentId: 'web-frontend',
        category: 'frontend',
        choice: 'Next.js',
        justification: 'One framework for screens and server.',
        alternatives: [
          { name: 'Remix', tradeoff: 'Great data handling, smaller ecosystem.' },
          { name: 'SvelteKit', tradeoff: 'Lighter, less known.' },
        ],
        locked: false,
      },
      {
        // Hostile choice name with a pipe — must not break the summary table.
        componentId: 'auth',
        category: 'auth',
        choice: 'Home | grown auth',
        justification: 'Overridden by the user.',
        alternatives: [
          { name: 'Clerk', tradeoff: 'Hosted, quick.' },
          { name: 'Auth.js', tradeoff: 'Free, more wiring.' },
        ],
        locked: true,
      },
    ],
    structure: [],
  };
}

describe('renderStack', () => {
  it('snapshots 04-STACK.md with a locked decision and hostile cell', () => {
    expect(renderStack(output(), META)).toMatchSnapshot();
  });

  it('escapes a pipe in the summary table so the table structure survives', () => {
    const md = renderStack(output(), META);
    expect(md).toContain('Home \\| grown auth');
  });

  it('renders the empty-decisions fallback', () => {
    const md = renderStack({ decisions: [], structure: [] }, META);
    expect(md).toContain('_No stack decisions were needed._');
  });
});
