import type { Phase4Output } from '../../schemas/stack.js';
import type { FolderNode } from '../../schemas/structure.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';

/**
 * Render `03-STRUCTURE.md` (spec §3.2, §8.7): the proposed folder tree, drawn
 * against the ACCEPTED stack. Keeps its Phase 3 number but is a Phase 4 output
 * (pitfall §7.1). Deterministic box-drawing tree from the shared `Phase4Output`;
 * the LLM proposed the tree, this only lays it out.
 *
 * Names and descriptions come from the model, so they are sanitized to a single
 * line before rendering (a stray newline would break the tree — the same class of
 * silent breaker guarded for Mermaid in M7).
 */
export function renderStructure(obj: Phase4Output, meta: FrontmatterMeta): string {
  const sections: string[] = ['# Structure', ''];

  if (obj.structure.length === 0) {
    sections.push('_No folder structure was proposed._');
    return withFrontmatter({ ...meta, phase: 4 }, `${sections.join('\n')}\n`);
  }

  sections.push(
    'Proposed starting layout for a fresh repository built on the accepted stack.',
    '',
    '```text',
    ...renderNodes(obj.structure, ''),
    '```',
  );

  return withFrontmatter({ ...meta, phase: 4 }, `${sections.join('\n')}\n`);
}

/** Collapse arbitrary model text to a single trimmed line. */
function oneLine(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderNodes(nodes: readonly FolderNode[], prefix: string): string[] {
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const name = oneLine(node.name) + (node.kind === 'dir' ? '/' : '');
    const desc = node.description !== undefined ? `  # ${oneLine(node.description)}` : '';
    lines.push(`${prefix}${connector}${name}${desc}`);
    if (node.kind === 'dir' && node.children && node.children.length > 0) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(...renderNodes(node.children, childPrefix));
    }
  });
  return lines;
}
