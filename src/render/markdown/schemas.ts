import { type Phase3Output, type Retention, toErInput } from '../../schemas/schema-model.js';
import { renderErDiagram } from '../mermaid/er.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';
import { renderTable } from './table.js';

/**
 * Render `03-SCHEMAS.md` (spec §8.6) from the confirmed `Phase3Output`. Everything is
 * user-confirmed by the time it renders — cardinality disambiguated, enum values
 * captured, retention chosen — so this is a deterministic render, not an LLM synthesis
 * (§7.3.4). Models are shown as "readable tables, never raw JSON" (§8.6) plus a Mermaid
 * ER diagram of the whole model.
 *
 * This is Phase 3's ONLY artifact. `03-STRUCTURE.md` keeps its Phase 3 number but is a
 * Phase 4 output — a folder tree cannot precede the stack it must match (§8.6/§8.7,
 * pitfall §7.1). Emitting it here would be the single most likely ordering bug.
 */
export function renderSchemas(obj: Phase3Output, meta: FrontmatterMeta): string {
  const sections: string[] = ['# Schemas', '', '## Models'];

  if (obj.models.length === 0) {
    sections.push('', '_No models derived yet._');
  } else {
    for (const model of obj.models) {
      sections.push('', renderModel(model));
    }
  }

  sections.push('', '## Entity relationships', '', renderErDiagram(toErInput(obj)));
  sections.push('', '## Data retention', '', renderRetention(obj.retention));

  return withFrontmatter({ ...meta, phase: 3 }, `${sections.join('\n')}\n`);
}

function renderModel(model: Phase3Output['models'][number]): string {
  const lines = [`### ${model.name}`, ''];
  if (model.description.trim().length > 0) {
    lines.push(model.description.trim(), '');
  }

  if (model.attributes.length === 0) {
    lines.push('_No attributes._');
    return lines.join('\n');
  }

  lines.push(
    renderTable(
      [
        { header: 'Attribute' },
        { header: 'Type' },
        { header: 'Required' },
        { header: 'Allowed values' },
      ],
      model.attributes.map((attr) => [
        attr.name,
        attr.type,
        attr.required ? 'Yes' : 'No',
        attr.isEnum ? enumCell(attr.enumValues) : '—',
      ]),
    ),
  );
  return lines.join('\n');
}

/** Render an enum attribute's allowed values; note when discovery captured none. */
function enumCell(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : '_(none captured)_';
}

const RETENTION_COPY: Record<Retention, string> = {
  recoverable: 'Deleted records are recoverable (soft delete — kept and restorable).',
  hard_delete: 'Deleted records are permanently removed (hard delete).',
  archived: 'Deleted records are archived (hidden but retained).',
  undecided: 'Not decided yet.',
};

function renderRetention(retention: Retention): string {
  return RETENTION_COPY[retention];
}
