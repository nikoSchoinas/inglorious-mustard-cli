import { z } from 'zod';
import { Task } from './task.js';

/**
 * The Phase 6 output (spec §8.9, technical-plan §5, M13). Two schemas, split the
 * same way as `architecture.ts`:
 *   - `Sequence` is the STRICT `sequence` pass output — the tasks the deep model
 *     chunked and sized, WITHOUT a build order (deterministic code owns the
 *     topology, so the LLM never asserts one). Its shape and `promptVersion` flow
 *     into the fixture key.
 *   - `Phase6Output` is the RELAXED object persisted to
 *     `PhaseState.synthesisedObject` and consumed by the `06-ROADMAP.md` renderer:
 *     the tasks in dependency order plus the two policy answers the header shows.
 *     No bounds, so a degraded fallback (empty task list, §9.8) round-trips.
 */

/**
 * One task as the pass emits it: the frozen §9.3 `Task` minus `status` (every
 * freshly-sequenced task is `todo`; the orchestrator stamps it). `dependsOn`
 * carries the ids of tasks that must ship first — the input the deterministic
 * `topoOrder` consumes.
 */
export const SequencedTask = Task.omit({ status: true });
export type SequencedTask = z.infer<typeof SequencedTask>;

/** The strict `sequence` pass output: at least one agent-sized task. */
export const Sequence = z.object({
  tasks: z.array(SequencedTask).min(1),
});
export type Sequence = z.infer<typeof Sequence>;

/**
 * The Phase 6 object persisted to `PhaseState.synthesisedObject`. `orderedTasks`
 * is the topologically-sorted, status-stamped list (mirrored into
 * `session.tasks`); `hoursPerWeek`/`testingPolicy` echo the two seed answers so
 * the roadmap header records them honestly.
 */
export const Phase6Output = z.object({
  orderedTasks: z.array(Task),
  hoursPerWeek: z.string(),
  testingPolicy: z.string(),
});
export type Phase6Output = z.infer<typeof Phase6Output>;
