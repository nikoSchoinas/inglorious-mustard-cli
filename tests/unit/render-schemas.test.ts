// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { FrontmatterMeta } from '../../src/render/markdown/frontmatter.js';
import { renderSchemas } from '../../src/render/markdown/schemas.js';
import type { Phase3Output } from '../../src/schemas/schema-model.js';
import { assertValidMermaid } from './helpers/mermaid.js';

/**
 * M10 acceptance (technical-plan §5): a stable `03-SCHEMAS.md` snapshot, hostile-cell
 * escaping, and a valid ER diagram. Frontmatter meta is injected with a fixed clock so
 * the render is deterministic (pattern from `render-use-cases.test.ts`).
 */

const META: FrontmatterMeta = {
  phase: 3,
  sessionId: 'testsession01',
  generatedAt: '2026-08-01T00:00:00.000Z',
  mustardVersion: '0.0.0-test',
};

function output(): Phase3Output {
  return {
    models: [
      {
        entityId: 'e1',
        name: 'Order',
        description: 'A customer purchase',
        attributes: [
          { name: 'total', type: 'number', required: true, isEnum: false, enumValues: [] },
          {
            name: 'status',
            type: 'string',
            required: true,
            isEnum: true,
            enumValues: ['pending', 'paid', 'shipped'],
          },
        ],
        relationships: [{ toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' }],
      },
      {
        entityId: 'e2',
        name: 'Item',
        description: '',
        attributes: [
          { name: 'name', type: 'string', required: true, isEnum: false, enumValues: [] },
        ],
        relationships: [],
      },
    ],
    retention: 'recoverable',
  };
}

describe('renderSchemas', () => {
  it('renders a stable 03-SCHEMAS.md', () => {
    expect(renderSchemas(output(), META)).toMatchSnapshot();
  });

  it('emits a valid Mermaid ER diagram', async () => {
    const md = renderSchemas(output(), META);
    await assertValidMermaid(md.slice(md.indexOf('```mermaid')));
  });

  it('escapes hostile cell content so a pipe cannot break the table', () => {
    const hostile: Phase3Output = {
      models: [
        {
          entityId: 'e1',
          name: 'Thing',
          description: '',
          attributes: [
            { name: 'a | b', type: 'x\ny', required: true, isEnum: false, enumValues: [] },
          ],
          relationships: [],
        },
      ],
      retention: 'undecided',
    };
    const md = renderSchemas(hostile, META);
    expect(md).toContain('a \\| b');
    expect(md).toContain('x<br>y');
  });

  it('shows enum values and marks enums with none captured', () => {
    expect(renderSchemas(output(), META)).toContain('pending, paid, shipped');

    const noValues = output();
    const status = noValues.models
      .find((m) => m.entityId === 'e1')
      ?.attributes.find((a) => a.name === 'status');
    if (status) {
      status.enumValues = [];
    }
    expect(renderSchemas(noValues, META)).toContain('_(none captured)_');
  });
});
