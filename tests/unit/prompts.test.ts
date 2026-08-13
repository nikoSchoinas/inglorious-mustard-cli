import { describe, expect, it } from 'vitest';
import { runPrompts } from '../../src/commands/prompts.js';
import { PromptsJson } from '../../src/schemas/cli-json.js';
import type { MustardSession } from '../../src/schemas/session.js';
import type { Task } from '../../src/schemas/task.js';
import { ScriptedPrompter, type ScriptedStep } from '../../src/ui/scripted-prompter.js';
import { makeSession } from './fixtures.js';

/**
 * `mustard prompts` (spec §3.3, §9.6, M14): the return loop. Covers the JSON surface,
 * the interactive pick → card → clipboard happy path, and the graceful edges.
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

function sessionWith(tasks: Task[]): MustardSession {
  return makeSession({ tasks });
}

function run(opts: {
  tasks: Task[];
  json?: boolean;
  script?: ScriptedStep[];
  copy?: (t: string) => Promise<boolean>;
  readCard?: (cwd: string | undefined, name: string) => string | undefined;
}) {
  const prompter = new ScriptedPrompter(opts.script ?? []);
  const printed: string[] = [];
  return {
    prompter,
    printed,
    promise: runPrompts({
      json: opts.json,
      load: () => sessionWith(opts.tasks),
      print: (m) => printed.push(m),
      prompter,
      copy: opts.copy,
      readCard: opts.readCard,
    }),
  };
}

describe('runPrompts --json', () => {
  it('emits every task flagged blocked/ready and validates against the schema', async () => {
    const tasks = [
      task('T001', { status: 'done' }),
      task('T002', { dependsOn: ['T001'] }), // deps done → not blocked
      task('T003', { dependsOn: ['T002'] }), // dep T002 not done → blocked
    ];
    const h = run({ tasks, json: true });
    await h.promise;
    const parsed = PromptsJson.parse(JSON.parse(h.printed.join('\n')));
    // `blocked` is dependency-readiness only, independent of a task's own status: a
    // done task with satisfied deps is not "blocked".
    const byId = Object.fromEntries(parsed.tasks.map((t) => [t.id, t.blocked]));
    expect(byId).toEqual({ T001: false, T002: false, T003: true });
    expect(parsed.tasks.find((t) => t.id === 'T001')?.status).toBe('done');
  });
});

describe('runPrompts (interactive)', () => {
  it('prints the on-disk card for the picked task and copies it to the clipboard', async () => {
    const tasks = [task('T001', { title: 'Set up the project' })];
    let copied: string | undefined;
    const h = run({
      tasks,
      script: [{ kind: 'select', value: 'T001' }],
      copy: async (t) => {
        copied = t;
        return true;
      },
      readCard: () => 'CARD BODY',
    });
    await h.promise;
    expect(h.printed).toContain('CARD BODY');
    expect(copied).toBe('CARD BODY');
    expect(h.prompter.notes.some((n) => n.title === 'Copied')).toBe(true);
  });

  it('notes graceful failure when the clipboard is unavailable', async () => {
    const h = run({
      tasks: [task('T001')],
      script: [{ kind: 'select', value: 'T001' }],
      copy: async () => false,
      readCard: () => 'CARD BODY',
    });
    await h.promise;
    expect(h.prompter.notes.some((n) => n.title === 'Copy manually')).toBe(true);
  });

  it('notes when the prompt-card file is missing', async () => {
    const h = run({
      tasks: [task('T001')],
      script: [{ kind: 'select', value: 'T001' }],
      readCard: () => undefined,
    });
    await h.promise;
    expect(h.prompter.notes.some((n) => n.title === 'Missing card')).toBe(true);
  });

  it('notes when there is no roadmap yet', async () => {
    const h = run({ tasks: [] });
    await h.promise;
    expect(h.prompter.notes.some((n) => n.title === 'Nothing to build')).toBe(true);
  });

  it('offers every task regardless of dependency readiness (no gating)', async () => {
    // T002 depends on the still-todo T001, so under the old gating it would have
    // been hidden. The picker now offers it, and its card prints when chosen.
    const tasks = [task('T001', { status: 'todo' }), task('T002', { dependsOn: ['T001'] })];
    const h = run({
      tasks,
      script: [{ kind: 'select', value: 'T002' }],
      readCard: () => 'CARD BODY',
      copy: async () => true,
    });
    await h.promise;
    expect(h.printed).toContain('CARD BODY');
  });
});
