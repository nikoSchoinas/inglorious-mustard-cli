import { z } from 'zod';
import { PhaseAnalysis } from './analysis.js';
import { Task } from './task.js';

/**
 * Global literacy register (spec §8.3). Selects the phrasing variant of every
 * subsequent question — one bank, three registers.
 */
export const Literacy = z.enum(['none', 'some', 'developer']);
export type Literacy = z.infer<typeof Literacy>;

/** A single answer to a single question. Persisted immediately on submission (§7.3.1). */
export const Answer = z.object({
  questionId: z.string(),
  type: z.enum(['select', 'multiselect', 'text', 'editor', 'confirm', 'proposal']),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.boolean()]),
  source: z.enum(['seed', 'followup', 'derived']),
  askedAt: z.iso.datetime(),
});
export type Answer = z.infer<typeof Answer>;

/** Per-phase state within the session (§9.3). `analysisRuns` is the ANALYSE loop guard (max 2). */
export const PhaseState = z.object({
  id: z.number().int().min(0).max(7),
  status: z.enum(['pending', 'in_progress', 'awaiting_review', 'accepted']),
  answers: z.array(Answer),
  analysis: PhaseAnalysis.optional(),
  followUpsAsked: z.number().int().default(0),
  analysisRuns: z.number().int().default(0), // loop guard, max 2
  artifactPaths: z.array(z.string()).default([]),
  acceptedAt: z.iso.datetime().optional(),
});
export type PhaseState = z.infer<typeof PhaseState>;

/** One line in the cost ledger (§9.3): tokens + estimated USD for a single LLM pass. */
export const CostEntry = z.object({
  phase: z.number(),
  pass: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedUsd: z.number(),
  at: z.iso.datetime(),
});
export type CostEntry = z.infer<typeof CostEntry>;

/**
 * The entire committed session state (`mustard/.session.json`, spec §9.3).
 *
 * `facts` is the merged store read by `when` expressions (§9.4): `maps_to`
 * targets from answered questions plus ANALYSE `derivedFacts`. The merge policy
 * (explicit answers overwrite derived facts; derived facts never overwrite
 * answers) lives in `engine/facts.ts`.
 */
export const MustardSession = z.object({
  schemaVersion: z.literal(1),
  projectName: z.string(),
  literacy: Literacy,
  agentTarget: z.enum([
    'claude-code',
    'codex',
    'cursor',
    'copilot',
    'gemini-cli',
    'antigravity',
    'other',
    'undecided',
  ]),
  currentPhase: z.number().int(),
  phases: z.array(PhaseState),
  ledger: z.array(CostEntry),
  facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  tasks: z.array(Task).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MustardSession = z.infer<typeof MustardSession>;
