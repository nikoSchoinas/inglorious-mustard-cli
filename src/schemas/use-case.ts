import { z } from 'zod';

/**
 * A single use case (spec §9.3): actor, preconditions, a happy path in
 * user/system/database terms, and the `failurePaths` produced by the signature
 * failure interrogation (§8.5 step 6). `02-USE-CASES.md` renders from these.
 */
export const UseCase = z.object({
  id: z.string(),
  title: z.string(),
  actorId: z.string(),
  preconditions: z.array(z.string()),
  happyPath: z.array(
    z.object({
      actor: z.enum(['user', 'system', 'database', 'external']),
      action: z.string(),
    }),
  ),
  failurePaths: z.array(
    z.object({
      trigger: z.string(),
      systemResponse: z.string(),
      userVisible: z.string(),
    }),
  ),
  dependsOn: z.array(z.string()),
});
export type UseCase = z.infer<typeof UseCase>;
