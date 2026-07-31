import { z } from 'zod';

/**
 * A single roadmap task (spec §9.3), sized to fit one agent prompt. Produced by
 * the SEQUENCE pass in Phase 6 and consumed by the prompt-card renderer (Phase 7)
 * and `mustard prompts`.
 */
export const Task = z.object({
  id: z.string(), // T001…
  title: z.string(),
  group: z.enum(['setup', 'auth', 'feature', 'polish']),
  useCaseIds: z.array(z.string()),
  dependsOn: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()).min(1),
  filesTouched: z.array(z.string()),
  status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
});
export type Task = z.infer<typeof Task>;
