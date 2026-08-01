// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  componentGraphFromStack,
  renderComponentDiagram,
} from '../../src/render/mermaid/component.js';
import { makeComponentGraph, makeStackDecisions } from './fixtures.js';
import { assertValidMermaid } from './helpers/mermaid.js';

describe('renderComponentDiagram', () => {
  it('renders nodes and labelled edges', () => {
    expect(renderComponentDiagram(makeComponentGraph())).toMatchSnapshot();
  });

  it('emits valid Mermaid', async () => {
    await assertValidMermaid(renderComponentDiagram(makeComponentGraph()));
  });

  it('renders a disconnected node set (empty edges) validly', async () => {
    const graph = makeComponentGraph({ edges: [] });
    await assertValidMermaid(renderComponentDiagram(graph));
  });
});

describe('componentGraphFromStack', () => {
  it('derives one node per decision, no edges', () => {
    const graph = componentGraphFromStack(makeStackDecisions());
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
    expect(renderComponentDiagram(graph)).toMatchSnapshot();
  });

  it('produces valid Mermaid from stack decisions', async () => {
    await assertValidMermaid(renderComponentDiagram(componentGraphFromStack(makeStackDecisions())));
  });
});
