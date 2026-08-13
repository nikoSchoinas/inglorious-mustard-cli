import { z } from 'zod';

/**
 * The proposed folder tree (spec §3.2, §8.7): `03-STRUCTURE.md`. It keeps its
 * Phase 3 number but is a Phase 4 output — a folder tree cannot precede the stack
 * it must match (pitfall §7.1), so it is rendered at the end of Phase 4 once the
 * accepted stack exists.
 *
 * LLM-proposed by the `propose-structure` pass (fast tier) from the accepted
 * `StackDecision[]` plus the Phase 3 models, so the tree is idiomatic for the
 * chosen frameworks rather than a rigid template. This schema is additive and
 * flows into its own fixture key, so it is not one of the frozen §9.3 contracts.
 */

/**
 * One node in the tree. The TypeScript type is recursive (the renderer walks it
 * to any depth), but the runtime schema below is NOT built with `z.lazy` — a
 * self-referencing schema converts to a circular `$ref`, which Anthropic's
 * `json_schema` structured-output format rejects outright ("Circular reference
 * detected"). A `dir` may carry `children`; a `file` never does (enforced by the
 * renderer, not the schema, so a loosely-shaped model reply still parses).
 */
export interface FolderNode {
  name: string;
  kind: 'dir' | 'file';
  /** One short line on what lives here — shown inline in the rendered tree. */
  description?: string;
  children?: FolderNode[];
}

/**
 * How deep the schema lets the tree nest. The `propose-structure` prompt asks for
 * a "roughly 2–3 levels deep" starting skeleton; this leaves generous margin. The
 * bound is what keeps the emitted JSON schema finite and acyclic — a plain nested
 * object per level instead of a self-reference.
 */
const MAX_TREE_DEPTH = 6;

/**
 * Build the node schema by unrolling the recursion to a fixed depth. Each level
 * is a distinct inline object, so the AI SDK emits a finite (acyclic) JSON schema
 * the Anthropic API accepts — unlike `z.lazy`, which would self-reference.
 */
function folderNodeToDepth(remaining: number): z.ZodTypeAny {
  const base = {
    name: z.string(),
    kind: z.enum(['dir', 'file']),
    description: z.string().optional(),
  };
  if (remaining <= 1) {
    return z.object(base);
  }
  return z.object({
    ...base,
    children: z.array(folderNodeToDepth(remaining - 1)).optional(),
  });
}

export const FolderNode = folderNodeToDepth(MAX_TREE_DEPTH) as z.ZodType<FolderNode>;

/** The whole proposed tree — the top-level entries of the project root. */
export const FolderTree = z.array(FolderNode);
export type FolderTree = z.infer<typeof FolderTree>;
