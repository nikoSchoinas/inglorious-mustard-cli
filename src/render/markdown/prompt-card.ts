import type { Task } from '../../schemas/task.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';

/**
 * Render one Phase 7 prompt card (spec §8.10): a ready-to-paste instruction for a
 * single roadmap task. Carries the instruction, pointers to the relevant `mustard/`
 * context files, the inlined applicable AI-LAWS, the acceptance criteria, and an
 * explicit "do not touch" list — everything an agent needs to build the task
 * without wandering. Deterministic; written to `07-PROMPTS/`.
 */

export interface PromptCardContext {
  /** The Phase 1 machine-directed AI-LAWS, inlined into every card (global, ≤200 lines). */
  aiLaws: readonly string[];
  /** `mustard/` files the agent should read for this task. */
  contextFiles: readonly string[];
  /** Files owned by OTHER tasks — the do-not-touch list for this one. */
  doNotTouch: readonly string[];
}

/** The `07-PROMPTS/` filename for a task: `T001-set-up-the-project.md`. */
export function promptCardFilename(task: Task): string {
  return `07-PROMPTS/${task.id}-${slugify(task.title)}.md`;
}

export function renderPromptCard(
  task: Task,
  ctx: PromptCardContext,
  meta: FrontmatterMeta,
): string {
  const sections: string[] = [`# ${task.id} — ${task.title}`, ''];

  sections.push('## Instruction', '');
  sections.push(
    `Build **${task.title}**. Implement it fully and stop — this is one task in a sequenced roadmap, not the whole product.`,
    '',
  );
  if (task.dependsOn.length > 0) {
    const verb = task.dependsOn.length === 1 ? 'is' : 'are';
    sections.push(`This task assumes ${task.dependsOn.join(', ')} ${verb} already done.`, '');
  }

  sections.push('## Context — read these first', '');
  if (ctx.contextFiles.length === 0) {
    sections.push('_No context files._', '');
  } else {
    for (const file of ctx.contextFiles) {
      sections.push(`- \`${file}\``);
    }
    sections.push('');
  }

  sections.push('## Acceptance criteria', '');
  for (const criterion of task.acceptanceCriteria) {
    sections.push(`- [ ] ${criterion}`);
  }
  sections.push('');

  sections.push('## Laws — apply all of these', '');
  if (ctx.aiLaws.length === 0) {
    sections.push('_No laws were recorded._', '');
  } else {
    for (const law of ctx.aiLaws) {
      sections.push(`- ${law}`);
    }
    sections.push('');
  }

  sections.push('## Do not touch', '');
  if (ctx.doNotTouch.length === 0) {
    sections.push('_Nothing is off-limits for this task._');
  } else {
    sections.push('These belong to other tasks — leave them alone:');
    for (const file of ctx.doNotTouch) {
      sections.push(`- \`${file}\``);
    }
  }

  return withFrontmatter({ ...meta, phase: 7 }, `${sections.join('\n').trimEnd()}\n`);
}

/** Lowercase, keep alphanumerics, collapse the rest to single hyphens. */
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'task'
  );
}
