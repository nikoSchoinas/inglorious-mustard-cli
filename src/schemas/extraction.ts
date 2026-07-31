import { z } from 'zod';

/**
 * Output of the Phase 2 EXTRACT pass (spec §9.3): the domain model inferred from
 * the user's raw description — actors, entities (with attributes and
 * relationships) and capabilities. `relationships.confidence: 'ambiguous'`
 * triggers a disambiguation question in Phase 3 (§8.6).
 */
export const DomainExtraction = z.object({
  actors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      isPrimary: z.boolean(),
    }),
  ),
  entities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      attributes: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          required: z.boolean(),
          isEnum: z.boolean(),
        }),
      ),
      relationships: z.array(
        z.object({
          toEntityId: z.string(),
          cardinality: z.enum(['one_to_one', 'one_to_many', 'many_to_many']),
          confidence: z.enum(['high', 'ambiguous']), // 'ambiguous' triggers a question
        }),
      ),
    }),
  ),
  capabilities: z.array(
    z.object({
      id: z.string(),
      actorId: z.string(),
      verb: z.string(),
      object: z.string(),
      description: z.string(),
    }),
  ),
});
export type DomainExtraction = z.infer<typeof DomainExtraction>;
