import type { DomainExtraction } from '../../schemas/extraction.js';
import { IdAllocator, mermaidId } from './id.js';

/**
 * Render a `DomainExtraction` as a Mermaid `erDiagram` (spec §8.6, §9.7). Entities
 * become blocks of typed attributes; `relationships` become crow's-foot lines
 * mapped from the cardinality enum. Emitted as a ```mermaid fenced block so it
 * renders in GitHub/Notion/IDEs.
 *
 * `confidence: 'ambiguous'` is not drawn — it drives a Phase 3 disambiguation
 * question, not the diagram.
 */

const CROWS_FOOT: Record<
  DomainExtraction['entities'][number]['relationships'][number]['cardinality'],
  string
> = {
  one_to_one: '||--||',
  one_to_many: '||--o{',
  many_to_many: '}o--o{',
};

export function renderErDiagram(extraction: DomainExtraction): string {
  const alloc = new IdAllocator();
  // entity.id → node id (relationships reference entities by id, not name).
  const nodeIdByEntityId = new Map<string, string>();
  for (const entity of extraction.entities) {
    nodeIdByEntityId.set(entity.id, alloc.idFor(entity.id, entity.name));
  }

  const lines: string[] = ['erDiagram'];

  for (const entity of extraction.entities) {
    const nodeId = nodeIdByEntityId.get(entity.id) as string;
    if (entity.attributes.length === 0) {
      lines.push(`  ${nodeId} {`, '  }');
      continue;
    }
    lines.push(`  ${nodeId} {`);
    for (const attr of entity.attributes) {
      const type = mermaidId(attr.type || 'string');
      const name = mermaidId(attr.name);
      const notes = [attr.required ? 'required' : null, attr.isEnum ? 'enum' : null]
        .filter((n): n is string => n !== null)
        .join(', ');
      lines.push(notes === '' ? `    ${type} ${name}` : `    ${type} ${name} "${notes}"`);
    }
    lines.push('  }');
  }

  for (const entity of extraction.entities) {
    const fromId = nodeIdByEntityId.get(entity.id) as string;
    for (const rel of entity.relationships) {
      const toId = nodeIdByEntityId.get(rel.toEntityId);
      if (toId === undefined) {
        continue; // dangling reference — skip rather than emit invalid Mermaid
      }
      lines.push(`  ${fromId} ${CROWS_FOOT[rel.cardinality]} ${toId} : "relates to"`);
    }
  }

  return fence(lines);
}

function fence(lines: readonly string[]): string {
  return `\`\`\`mermaid\n${lines.join('\n')}\n\`\`\``;
}
