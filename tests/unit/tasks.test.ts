import { describe, expect, it } from 'vitest';
import { isUnblocked, unblockedTasks } from '../../src/engine/tasks.js';
import type { Task } from '../../src/schemas/task.js';

/**
 * The unblocked-prompt computation (technical-plan §5 M14 acceptance): a task is
 * ready when it is not done and every task it depends on is done. Pure, no session.
 */
function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    group: 'feature',
    useCaseIds: [],
    dependsOn: [],
    acceptanceCriteria: ['builds'],
    filesTouched: [],
    status: 'todo',
    ...overrides,
  };
}

describe('isUnblocked', () => {
  it('is true for a task with no dependencies', () => {
    const t = task('T001');
    expect(isUnblocked(t, [t])).toBe(true);
  });

  it('is false while any dependency is not done', () => {
    const dep = task('T001', { status: 'in_progress' });
    const t = task('T002', { dependsOn: ['T001'] });
    expect(isUnblocked(t, [dep, t])).toBe(false);
  });

  it('is true once every dependency is done', () => {
    const dep = task('T001', { status: 'done' });
    const t = task('T002', { dependsOn: ['T001'] });
    expect(isUnblocked(t, [dep, t])).toBe(true);
  });

  it('is false for a task that is already done', () => {
    const t = task('T001', { status: 'done' });
    expect(isUnblocked(t, [t])).toBe(false);
  });

  it('treats a missing dependency id as blocking (never crashes)', () => {
    const t = task('T002', { dependsOn: ['T404'] });
    expect(isUnblocked(t, [t])).toBe(false);
  });
});

describe('unblockedTasks', () => {
  it('returns only ready tasks, in roadmap order, excluding done ones', () => {
    const tasks: Task[] = [
      task('T001', { status: 'done' }),
      task('T002', { dependsOn: ['T001'] }), // deps done → ready
      task('T003', { dependsOn: ['T002'] }), // dep T002 not done → blocked
      task('T004'), // no deps → ready
    ];
    expect(unblockedTasks(tasks).map((t) => t.id)).toEqual(['T002', 'T004']);
  });
});
