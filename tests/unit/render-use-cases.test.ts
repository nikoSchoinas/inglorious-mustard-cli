import { describe, expect, it } from 'vitest';
import type { FrontmatterMeta } from '../../src/render/markdown/frontmatter.js';
import { renderUseCases } from '../../src/render/markdown/use-cases.js';
import type { Phase2Output } from '../../src/schemas/phase2-output.js';

/**
 * Renderer tests for `02-USE-CASES.md` (M9): a stable snapshot, hostile-cell
 * escaping, and the guard that every use case must carry a failure path.
 */

const META: FrontmatterMeta = {
  phase: 2,
  sessionId: 'testsession01',
  generatedAt: '2026-08-01T00:00:00.000Z',
  mustardVersion: '0.0.0-test',
};

function output(overrides: Partial<Phase2Output> = {}): Phase2Output {
  return {
    extraction: {
      actors: [{ id: 'a1', name: 'Member', description: 'The user', isPrimary: true }],
      entities: [],
      capabilities: [],
    },
    useCases: [
      {
        id: 'uc1',
        title: 'create habit',
        actorId: 'a1',
        preconditions: ['User is signed in'],
        happyPath: [
          { actor: 'user', action: 'taps New Habit' },
          { actor: 'system', action: 'validates it' },
          { actor: 'database', action: 'stores it' },
        ],
        failurePaths: [
          {
            trigger: 'empty name',
            systemResponse: 'block the save',
            userVisible: 'a validation error',
          },
        ],
        dependsOn: [],
      },
    ],
    dependencyOrder: ['uc1'],
    screens: { approach: 'sketch', screens: ['Create habit', 'Sign in'] },
    ...overrides,
  };
}

describe('renderUseCases', () => {
  it('renders a stable 02-USE-CASES.md', () => {
    expect(renderUseCases(output(), META)).toMatchSnapshot();
  });

  it('escapes hostile cell content so a pipe cannot break the table', () => {
    const md = renderUseCases(
      output({
        useCases: [
          {
            id: 'uc1',
            title: 'create habit',
            actorId: 'a1',
            preconditions: [],
            happyPath: [{ actor: 'user', action: 'types a | b' }],
            failurePaths: [{ trigger: 'x | y', systemResponse: 'a\nb', userVisible: 'ok' }],
            dependsOn: [],
          },
        ],
      }),
      META,
    );
    expect(md).toContain('types a \\| b');
    expect(md).toContain('x \\| y');
    expect(md).toContain('a<br>b');
  });

  it('resolves the actor name from the extraction', () => {
    expect(renderUseCases(output(), META)).toContain('**Actor:** Member');
  });

  it('throws when a use case has no failure paths (the interrogation was skipped)', () => {
    expect(() =>
      renderUseCases(
        output({
          useCases: [
            {
              id: 'uc1',
              title: 'create habit',
              actorId: 'a1',
              preconditions: [],
              happyPath: [],
              failurePaths: [],
              dependsOn: [],
            },
          ],
        }),
        META,
      ),
    ).toThrow(/no failure paths/i);
  });
});
