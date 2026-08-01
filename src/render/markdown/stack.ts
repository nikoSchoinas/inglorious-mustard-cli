import type { Phase4Output, StackDecision } from '../../schemas/stack.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';
import { renderTable } from './table.js';

/**
 * Render `04-STACK.md` (spec §8.7): every technology choice with its plain-language
 * justification and two alternatives — "every technology choice with its
 * justification" (§3.2). Deterministic; the LLM produced the decisions, this only
 * lays them out. Reads the `decisions` field of the shared `Phase4Output` (the same
 * object drives `03-STRUCTURE.md`).
 */
export function renderStack(obj: Phase4Output, meta: FrontmatterMeta): string {
  const sections: string[] = ['# Stack', ''];

  if (obj.decisions.length === 0) {
    sections.push('_No stack decisions were needed._');
    return withFrontmatter({ ...meta, phase: 4 }, `${sections.join('\n')}\n`);
  }

  sections.push('## At a glance', '', renderSummary(obj.decisions), '');

  for (const decision of obj.decisions) {
    sections.push(renderDecision(decision), '');
  }

  return withFrontmatter({ ...meta, phase: 4 }, `${sections.join('\n').trimEnd()}\n`);
}

/** A one-row-per-component summary table. */
function renderSummary(decisions: readonly StackDecision[]): string {
  return renderTable(
    [{ header: 'Component' }, { header: 'Choice' }, { header: 'Decided' }],
    decisions.map((d) => [d.category, d.choice, d.locked ? 'You (locked)' : 'MUSTARD']),
  );
}

function renderDecision(decision: StackDecision): string {
  const lines = [`## ${decision.category}: ${decision.choice}`, ''];
  if (decision.locked) {
    lines.push('_You already decided this — it is locked and will survive any redo._', '');
  }
  lines.push(decision.justification, '', '**Alternatives considered**', '');
  for (const alt of decision.alternatives) {
    lines.push(`- **${alt.name}** — ${alt.tradeoff}`);
  }
  return lines.join('\n');
}
