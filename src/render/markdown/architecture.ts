import type { Phase5Output } from '../../schemas/architecture.js';
import type { ComponentGraph } from '../mermaid/component.js';
import { renderComponentDiagram } from '../mermaid/component.js';
import { renderSequenceDiagram } from '../mermaid/sequence.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';

/**
 * Render `05-ARCHITECTURE.md` (spec §8.8): the component diagram and the sequence
 * diagrams for the 2–3 riskiest use cases. Deterministic — the LLM produced the
 * architecture, this only lays it out, composing the M7 Mermaid renderers. The
 * ADR log lives in `05-DECISIONS.md` (§3.2), so it is not rendered here.
 *
 * Reads the shared `Phase5Output`; the same object drives `05-DECISIONS.md`.
 */
export function renderArchitecture(obj: Phase5Output, meta: FrontmatterMeta): string {
  const sections: string[] = ['# Architecture', ''];

  sections.push('## Component diagram', '');
  if (obj.componentGraph.components.length === 0) {
    sections.push('_No components were derived._', '');
  } else {
    sections.push(renderComponentDiagram(toComponentGraph(obj)), '');
  }

  sections.push('## Sequence diagrams — the riskiest flows', '');
  if (obj.sequenceSelections.length === 0) {
    sections.push('_No high-risk flows were selected._');
    return withFrontmatter({ ...meta, phase: 5 }, `${sections.join('\n').trimEnd()}\n`);
  }

  const byId = new Map(obj.selectedUseCases.map((uc) => [uc.id, uc]));
  for (const selection of obj.sequenceSelections) {
    const useCase = byId.get(selection.useCaseId);
    if (useCase === undefined) {
      continue; // orchestrator guards this; skip rather than emit a broken section
    }
    sections.push(`### ${useCase.title}`, '');
    sections.push(
      `_Why this flow: ${selection.rationale} (failure paths: ${selection.failurePathCount}, touches ${selection.crossComponentReach} components)._`,
      '',
    );
    sections.push(renderSequenceDiagram(useCase), '');
  }

  return withFrontmatter({ ...meta, phase: 5 }, `${sections.join('\n').trimEnd()}\n`);
}

/** Map the stored graph onto the `ComponentGraph` the M7 renderer consumes. */
function toComponentGraph(obj: Phase5Output): ComponentGraph {
  return {
    nodes: obj.componentGraph.components.map((c) => ({
      id: c.id,
      label: c.label,
      category: c.category,
    })),
    edges: obj.componentGraph.connections.map((e) =>
      e.label === undefined
        ? { from: e.from, to: e.to }
        : { from: e.from, to: e.to, label: e.label },
    ),
  };
}
