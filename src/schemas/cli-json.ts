import { z } from 'zod';
import { Literacy } from './session.js';

/**
 * The `--json` output contracts (spec §9.6 global flag, §11 v0.4). These are the
 * machine-readable shapes emitted by the query commands — `status`, `prompts`, and
 * `config models --list` — and are the forward contract the future plugin / MCP
 * surface consumes. Kept as explicit zod schemas so every `--json` payload is
 * validated before printing (technical-plan §5 M14 acceptance: "`--json` output
 * validates against a schema") and the shape cannot drift silently.
 *
 * `config models --list --json` emits the `ModelManifest` from `llm/manifest.ts`
 * directly, so it has no schema here.
 */

/** One phase's progress line in `status --json`. */
export const StatusPhaseJson = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.enum(['pending', 'in_progress', 'awaiting_review', 'accepted']),
  answers: z.number().int(),
  artifacts: z.number().int(),
});
export type StatusPhaseJson = z.infer<typeof StatusPhaseJson>;

/** `mustard status --json`. */
export const StatusJson = z.object({
  projectName: z.string(),
  literacy: Literacy,
  agentTarget: z.string(),
  currentPhase: z.number().int(),
  phases: z.array(StatusPhaseJson),
  tasks: z.object({ done: z.number().int(), total: z.number().int() }),
});
export type StatusJson = z.infer<typeof StatusJson>;

/**
 * One task in `prompts --json`. `blocked` reflects dependency-readiness only (some
 * dependency is not yet done) and is independent of the task's own `status`, so a
 * done task reads `status: 'done', blocked: false` rather than being conflated with
 * a task that is genuinely waiting on its predecessors.
 */
export const PromptTaskJson = z.object({
  id: z.string(),
  title: z.string(),
  group: z.enum(['setup', 'auth', 'feature', 'polish']),
  status: z.enum(['todo', 'in_progress', 'done']),
  dependsOn: z.array(z.string()),
  blocked: z.boolean(),
  acceptanceCriteria: z.array(z.string()),
  filesTouched: z.array(z.string()),
});
export type PromptTaskJson = z.infer<typeof PromptTaskJson>;

/** `mustard prompts --json` — every task, each flagged blocked or ready. */
export const PromptsJson = z.object({ tasks: z.array(PromptTaskJson) });
export type PromptsJson = z.infer<typeof PromptsJson>;
