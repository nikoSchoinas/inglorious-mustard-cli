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
 * One node in the tree. Recursive, so the AI SDK / Zod need the explicit type
 * annotation and `z.lazy` for the `children` self-reference. A `dir` may carry
 * `children`; a `file` never does (enforced by the renderer, not the schema, so a
 * loosely-shaped model reply still parses and degrades gracefully).
 */
export interface FolderNode {
  name: string;
  kind: 'dir' | 'file';
  /** One short line on what lives here — shown inline in the rendered tree. */
  description?: string;
  children?: FolderNode[];
}

export const FolderNode: z.ZodType<FolderNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    kind: z.enum(['dir', 'file']),
    description: z.string().optional(),
    children: z.array(FolderNode).optional(),
  }),
);

/** The whole proposed tree — the top-level entries of the project root. */
export const FolderTree = z.array(FolderNode);
export type FolderTree = z.infer<typeof FolderTree>;
