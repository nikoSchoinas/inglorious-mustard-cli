import type { StackDecision } from '../../schemas/stack.js';
import { IdAllocator, mermaidLabel } from './id.js';

/**
 * Component (architecture) diagram, rendered as a Mermaid `flowchart TD` (spec
 * §8.8, §9.7) — Mermaid has no first-class component diagram and flowchart is the
 * idiomatic form.
 *
 * `ComponentGraph` is a minimal, M1-only seam (its `category` reuses the
 * `StackDecision` enum). M7 renders it from hand-written fixtures and from
 * accepted stack decisions via `componentGraphFromStack`; M12's architecture
 * synthesis will produce a `ComponentGraph` and this renderer never changes.
 */
export interface ComponentGraph {
  nodes: ReadonlyArray<{ id: string; label: string; category: StackDecision['category'] }>;
  edges: ReadonlyArray<{ from: string; to: string; label?: string }>;
}

export function renderComponentDiagram(graph: ComponentGraph): string {
  const alloc = new IdAllocator();
  const nodeId = new Map<string, string>();
  for (const node of graph.nodes) {
    nodeId.set(node.id, alloc.idFor(node.id, node.id));
  }

  const lines: string[] = ['flowchart TD'];

  for (const node of graph.nodes) {
    const id = nodeId.get(node.id) as string;
    lines.push(`  ${id}["${mermaidLabel(node.label)}"]`);
  }

  for (const edge of graph.edges) {
    const from = nodeId.get(edge.from);
    const to = nodeId.get(edge.to);
    if (from === undefined || to === undefined) {
      continue; // dangling reference — skip rather than emit invalid Mermaid
    }
    lines.push(
      edge.label === undefined
        ? `  ${from} --> ${to}`
        : `  ${from} -->|${mermaidLabel(edge.label)}| ${to}`,
    );
  }

  return fence(lines);
}

/**
 * Derive a `ComponentGraph` from accepted stack decisions — one node per decision.
 * StackDecisions carry no edges, so the graph is a node set; M12 supplies a real
 * edge-bearing graph. This adapter keeps M7 strictly M1-only and testable.
 */
export function componentGraphFromStack(decisions: readonly StackDecision[]): ComponentGraph {
  return {
    nodes: decisions.map((d) => ({
      id: d.componentId,
      label: `${d.category}: ${d.choice}`,
      category: d.category,
    })),
    edges: [],
  };
}

function fence(lines: readonly string[]): string {
  return `\`\`\`mermaid\n${lines.join('\n')}\n\`\`\``;
}
