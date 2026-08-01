// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderErDiagram } from '../../src/render/mermaid/er.js';
import { makeDomainExtraction } from './fixtures.js';
import { assertValidMermaid } from './helpers/mermaid.js';

describe('renderErDiagram', () => {
  it('renders entities, attributes and crows-foot relationships', () => {
    expect(renderErDiagram(makeDomainExtraction())).toMatchSnapshot();
  });

  it('emits valid Mermaid', async () => {
    await assertValidMermaid(renderErDiagram(makeDomainExtraction()));
  });

  it('survives hostile entity names with distinct, resolvable ids', async () => {
    const extraction = makeDomainExtraction({
      entities: [
        {
          id: 'e1',
          name: 'end', // reserved word
          description: '',
          attributes: [{ name: 'id', type: 'string', required: true, isEnum: false }],
          relationships: [{ toEntityId: 'e2', cardinality: 'one_to_many', confidence: 'high' }],
        },
        {
          id: 'e2',
          name: 'café ☕',
          description: '',
          attributes: [],
          relationships: [],
        },
        {
          id: 'e3',
          name: 'end', // collides with e1 after sanitization
          description: '',
          attributes: [],
          relationships: [],
        },
      ],
      capabilities: [],
    });
    const out = renderErDiagram(extraction);
    await assertValidMermaid(out);
    expect(out).toMatchSnapshot();
  });
});
