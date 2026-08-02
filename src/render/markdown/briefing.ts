import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';

/**
 * Render `00-BRIEFING.md` (spec §8.10): the one-page mission summary, written LAST
 * (pitfall §7.7) so it can reference the whole bundle. Cross-phase input, so it is
 * assembled by the orchestrator and rendered here rather than through the
 * one-schema-per-artifact registry.
 */

export interface BriefingContext {
  projectName: string;
  mission: string;
  useCaseCount: number;
  /** A short stack summary — one line per accepted decision. */
  stack: readonly { category: string; choice: string }[];
  taskCount: number;
  /** The agent adapter file written at the repo root (e.g. `CLAUDE.md`). */
  adapterPath: string;
}

export function renderBriefing(ctx: BriefingContext, meta: FrontmatterMeta): string {
  const sections: string[] = [`# ${ctx.projectName} — Briefing`, ''];

  sections.push('## Mission', '', ctx.mission, '');

  sections.push('## At a glance', '');
  sections.push(`- **Use cases:** ${ctx.useCaseCount}`);
  sections.push(`- **Roadmap tasks:** ${ctx.taskCount}`);
  sections.push(`- **Agent guide:** \`${ctx.adapterPath}\``);
  sections.push('');

  sections.push('## Stack', '');
  if (ctx.stack.length === 0) {
    sections.push('_No stack was recorded._', '');
  } else {
    for (const item of ctx.stack) {
      sections.push(`- **${item.category}:** ${item.choice}`);
    }
    sections.push('');
  }

  sections.push('## The bundle', '');
  sections.push('Everything the plan produced lives in `mustard/`:', '');
  sections.push('- `01-MANIFESTO.md` / `01-AI-LAWS.md` — values and machine rules');
  sections.push('- `02-USE-CASES.md` — actors, happy paths, failure paths');
  sections.push('- `03-SCHEMAS.md` / `03-STRUCTURE.md` — data model and folder tree');
  sections.push('- `04-STACK.md` — technology choices and why');
  sections.push('- `05-ARCHITECTURE.md` / `05-DECISIONS.md` — diagrams and the decisions log');
  sections.push('- `06-ROADMAP.md` — the sequenced tasks');
  sections.push('- `07-PROMPTS/` — a ready-to-paste prompt per task');
  sections.push('');

  sections.push('## Next', '');
  sections.push(
    'Run `mustard prompts` to get the first unblocked task, paste it into your agent, build it, and repeat.',
  );

  return withFrontmatter({ ...meta, phase: 7 }, `${sections.join('\n').trimEnd()}\n`);
}
