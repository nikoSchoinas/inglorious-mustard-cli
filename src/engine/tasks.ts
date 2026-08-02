import type { Task } from '../schemas/task.js';

/**
 * Roadmap-task readiness (spec §9.6 `mustard prompts`). A task is *unblocked* when
 * it is not already done and every task it depends on is done — the exact rule the
 * `prompts` command uses to decide which prompt cards to offer. Pure and
 * deterministic so it unit-tests without a session, an LLM or the filesystem
 * (technical-plan §5 M14 acceptance: "unit tests on the unblocked-prompt
 * computation").
 */

/** True when `task` can be worked on now: not done, and all its dependencies are done. */
export function isUnblocked(task: Task, all: readonly Task[]): boolean {
  if (task.status === 'done') {
    return false;
  }
  return task.dependsOn.every((depId) => {
    const dep = all.find((t) => t.id === depId);
    // A dependency that isn't done — or can't be found at all — blocks the task.
    return dep?.status === 'done';
  });
}

/** Every task ready to be worked on now, in the roadmap's existing order. */
export function unblockedTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((task) => isUnblocked(task, tasks));
}
