import type { Phase6Output } from '../../schemas/roadmap.js';
import type { Task } from '../../schemas/task.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';

/**
 * Render `06-ROADMAP.md` (spec §8.9): the sequenced tasks in dependency order,
 * grouped setup → auth → feature → polish, each with its acceptance criteria,
 * the files it touches, and the use cases it implements. Deterministic — the LLM
 * sized the tasks and the orchestrator ordered them; this only lays them out.
 *
 * Reads the shared `Phase6Output`; the same `orderedTasks` list is mirrored into
 * `session.tasks` for Phase 7 and `mustard prompts`.
 */

const GROUP_TITLES: Record<Task['group'], string> = {
  setup: 'Setup',
  auth: 'Auth',
  feature: 'Features',
  polish: 'Polish',
};

const GROUP_ORDER: readonly Task['group'][] = ['setup', 'auth', 'feature', 'polish'];

const HOURS_LABELS: Record<string, string> = {
  'under-5': 'Under 5 hours per week',
  '5-15': '5–15 hours per week',
  '15-30': '15–30 hours per week',
  'full-time': 'Full time',
};

const TESTING_LABELS: Record<string, string> = {
  none: 'None — checked by hand',
  critical: 'Critical paths only',
  'every-feature': 'Tests alongside every feature',
  tdd: 'Test-driven (tests first)',
};

export function renderRoadmap(obj: Phase6Output, meta: FrontmatterMeta): string {
  const sections: string[] = ['# Roadmap', ''];

  const hours = HOURS_LABELS[obj.hoursPerWeek] ?? obj.hoursPerWeek;
  const testing = TESTING_LABELS[obj.testingPolicy] ?? obj.testingPolicy;
  sections.push(`**Time budget:** ${hours}  ·  **Testing policy:** ${testing}`, '');

  if (obj.orderedTasks.length === 0) {
    sections.push('_No tasks were sequenced._');
    return withFrontmatter({ ...meta, phase: 6 }, `${sections.join('\n').trimEnd()}\n`);
  }

  sections.push(
    'Tasks are listed in dependency order — each is sized to fit a single agent prompt. Build them top to bottom; `mustard prompts` serves the unblocked ones as ready-to-paste cards.',
    '',
  );

  // Present tasks grouped, but preserve the topological order within each group.
  for (const group of GROUP_ORDER) {
    const tasks = obj.orderedTasks.filter((t) => t.group === group);
    if (tasks.length === 0) {
      continue;
    }
    sections.push(`## ${GROUP_TITLES[group]}`, '');
    for (const task of tasks) {
      sections.push(...renderTask(task));
    }
  }

  return withFrontmatter({ ...meta, phase: 6 }, `${sections.join('\n').trimEnd()}\n`);
}

function renderTask(task: Task): string[] {
  const lines: string[] = [`### ${task.id} — ${task.title}`, ''];

  const meta: string[] = [];
  if (task.dependsOn.length > 0) {
    meta.push(`**Depends on:** ${task.dependsOn.join(', ')}`);
  }
  if (task.useCaseIds.length > 0) {
    meta.push(`**Use cases:** ${task.useCaseIds.join(', ')}`);
  }
  if (meta.length > 0) {
    lines.push(meta.join('  ·  '), '');
  }

  lines.push('**Acceptance criteria:**');
  for (const criterion of task.acceptanceCriteria) {
    lines.push(`- ${criterion}`);
  }
  lines.push('');

  if (task.filesTouched.length > 0) {
    lines.push('**Files touched:**');
    for (const file of task.filesTouched) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  return lines;
}
