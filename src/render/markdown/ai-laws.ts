import type { ManifestoArtifact } from '../../schemas/manifesto.js';
import { CapExceededError } from './caps.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';

/**
 * Render `01-AI-LAWS.md` — the machine-directed rules (spec §8.4, §9.7). Imperative,
 * short sentences, one law per line. Capped at 200 lines: the book warns against
 * rule files over ~500 lines, and 200 is MUSTARD's deliberately stricter default.
 * The cap is enforced on the rendered output (a line-count property the schema
 * can't express) — on breach we throw rather than truncate, so the SYNTHESISE pass
 * can re-synthesise a shorter law set (technical-plan §7.9).
 */

const MAX_LINES = 200;

export function renderAiLaws(obj: ManifestoArtifact, meta: FrontmatterMeta): string {
  const laws = obj.aiLaws.map((law) => `- ${law}`).join('\n');

  const body = [
    `# AI Laws — ${obj.projectName}`,
    '',
    'Rules the coding agent must follow when writing code for this project.',
    '',
    laws,
    '',
  ].join('\n');

  const rendered = withFrontmatter({ ...meta, phase: 1 }, body);

  const lineCount = rendered.split('\n').length;
  if (lineCount > MAX_LINES) {
    throw new CapExceededError(
      '01-AI-LAWS.md',
      `${MAX_LINES}-line`,
      `${lineCount} lines (trim or merge laws to fit)`,
    );
  }

  return rendered;
}
