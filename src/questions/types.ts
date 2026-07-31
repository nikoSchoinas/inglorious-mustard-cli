import type { FactValue } from '../engine/facts.js';
import type { Literacy } from '../schemas/session.js';

/**
 * The frozen question-bank contract (spec §9.4, technical-plan §2.2).
 *
 * The bank is declarative content, isolated from the engine (§7.3.3): one typed
 * module per phase, consumed by a phase-agnostic engine. These types are frozen
 * in M2 — every future bank module, the snapshot tests, and the engine depend on
 * them. The bank is TS-only (no Zod): structure is guaranteed by `tsc` plus the
 * light runtime invariant check in `validateBank` (§9.4), not a schema parser.
 */

/**
 * Seed-question input types. This is `Answer.type` (schemas/session.ts) minus
 * `proposal` — a proposal is an LLM-driven review flow (§3.1), never a seed
 * question. Mirrors `Gap.suggestedType` in schemas/analysis.ts. Typing a bank
 * question `'proposal'` is therefore a compile error.
 */
export type QuestionType = 'select' | 'multiselect' | 'text' | 'editor' | 'confirm';

/**
 * The read-only facts view passed to a `when` predicate — the merged store of
 * `mapsTo` targets and ANALYSE `derivedFacts` (§9.3, engine/facts.ts). Keys are
 * full dotted strings (e.g. `needs.objectStorage`, `constraints.budget`,
 * `actorCount`); always read them via the `fact()` helper, never chained
 * property access. Under `noUncheckedIndexedAccess` every index is
 * `FactValue | undefined`, which nudges authors toward `fact()`.
 */
export type Facts = Readonly<Record<string, FactValue>>;

/**
 * A pure `(facts) => boolean` predicate (§9.4). No DSL, no `eval` — ordinary
 * type-checked TS. MUST be side-effect-free and MUST NOT throw on an absent
 * fact: a referenced-but-absent fact evaluates to false, a convention the
 * `fact()` helper enforces by returning `undefined`. A predicate that genuinely
 * throws is a bank bug and is surfaced loudly, not swallowed.
 */
export type WhenPredicate = (facts: Facts) => boolean;

/**
 * Prompt phrasing per literacy register — one bank, three registers (§8.3).
 * `none` is the single required key and the universal fallback; `some` and
 * `developer` are optional and fall back to `none` at resolve time.
 */
export interface PromptVariants {
  none: string;
  some?: string;
  developer?: string;
}

/** One choice for a `select` / `multiselect` question. */
export interface QuestionOption {
  value: string;
  label: string;
}

/** Validation for an `editor` question (spec §8.4 "min ~30 words, validated"). */
export interface EditorValidation {
  /** Minimum word count before the answer is accepted. */
  minWords?: number;
  /** Treat each non-empty line as a separate list item (§8.5 "one per line"). */
  linesAsList?: boolean;
}

/** A single declarative question in a phase's seed set. */
export interface Question {
  /** Globally unique across ALL phase modules (checked by `validateBank`). */
  id: string;
  type: QuestionType;
  prompt: PromptVariants;
  /** Dotted fact key this answer writes. Absent for raw-capture editors that feed the LLM, not the facts store. */
  mapsTo?: string;
  /** Absent ⇒ always shown. */
  when?: WhenPredicate;
  /** Plain-language hint shown under the prompt. */
  help?: string;
  /** Present (and non-empty) for `select`/`multiselect`; absent for other types. */
  options?: readonly QuestionOption[];
  /** `editor` questions only. */
  validation?: EditorValidation;
}

/** The follow-up generation budget for a phase (§9.4). Severities reuse `Gap.severity`. */
export interface FollowUpPolicy {
  maxGenerated: number;
  onlySeverity: ReadonlyArray<'blocking' | 'important' | 'good_to_know'>;
}

/** The phase's synthesis pass. `model` reuses the `MustardConfig.models` routing keys. */
export interface Synthesis {
  /** Pass name, keyed to a versioned system prompt in `src/llm/prompts/`. */
  pass: string;
  model: 'fast' | 'deep';
  /**
   * The artifacts THIS phase emits. The single source of truth for the
   * artifact↔phase mapping — e.g. `03-STRUCTURE.md` is a Phase 4 artifact
   * despite its number (§8.6/§8.7, pitfall §7.1).
   */
  artifacts: readonly string[];
}

/** One phase's declarative content. */
export interface Phase {
  /** 0–7. Phase 0 (Recon) sits outside the M-U-S-T-A-R-D acronym (§8.3). */
  phase: number;
  name: string;
  seed: readonly Question[];
  followUpPolicy: FollowUpPolicy;
  /** Optional — Phase 0 Recon has no LLM synthesis pass. */
  synthesis?: Synthesis;
}

// Re-export the literacy type so bank modules and consumers have one import site.
export type { Literacy };
