import type { ManifestoArtifact } from '../../schemas/manifesto.js';
import { CapExceededError } from './caps.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';

/**
 * Render `01-MANIFESTO.md` — the human-directed values and team rules (spec §8.4).
 * The book's 8–10 rule cap is enforced here as a hard upper bound of 10: caps are
 * a code check, not something the prompt is trusted to honour (technical-plan
 * §7.9). The schema also caps `values` at 10, so this is belt-and-suspenders — but
 * the renderer is the authoritative gate.
 */

const MAX_VALUES = 10;

export function renderManifesto(obj: ManifestoArtifact, meta: FrontmatterMeta): string {
  if (obj.values.length > MAX_VALUES) {
    throw new CapExceededError(
      '01-MANIFESTO.md',
      `${MAX_VALUES}-rule`,
      `${obj.values.length} rules (keep it to ${MAX_VALUES} — cut the weakest)`,
    );
  }

  const values = obj.values.map((v, i) => `${i + 1}. **${v.title}** — ${v.rationale}`).join('\n');

  const body = [
    `# ${obj.projectName} — Manifesto`,
    '',
    '## Why this exists',
    '',
    obj.mission,
    '',
    '## What we live by',
    '',
    values,
    '',
  ].join('\n');

  return withFrontmatter({ ...meta, phase: 1 }, body);
}
