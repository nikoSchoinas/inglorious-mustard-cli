import type { Literacy } from '../schemas/session.js';
import { phase0 } from './bank/phase-0.js';
import { phase1 } from './bank/phase-1.js';
import { phase2 } from './bank/phase-2.js';
import { phase3 } from './bank/phase-3.js';
import type { Facts, Phase, Question, QuestionOption } from './types.js';

/**
 * The question-bank registry and the pure functions the engine drives it with.
 *
 * DESIGN INVARIANT (§7.3.3, pitfall §7.2): this module is fully generic over
 * `Phase`. It contains ZERO phase-specific question logic — no branching on a
 * phase number, no hard-coded question ids, no prompt text. All question content
 * and branching lives in the `bank/phase-*.ts` modules. Putting any of that here
 * is a bug against the "questions are declarative content, isolated from the
 * engine" principle.
 */

/** The frozen bank: one module per phase, in order. */
export const PHASES: readonly Phase[] = [phase0, phase1, phase2, phase3];

/**
 * Resolve a question's prompt for a literacy register, applying the fallback
 * rule (§9.4): a missing `some`/`developer` variant falls back to `none`, which
 * is always present. Pure.
 */
export function resolvePrompt(question: Question, literacy: Literacy): string {
  return question.prompt[literacy] ?? question.prompt.none;
}

/**
 * Keep the questions whose `when` is absent or returns true against `facts`.
 * Absent facts are handled by the predicates themselves (via `fact()`); a
 * predicate that throws is a bank bug and is NOT swallowed here.
 */
export function filterQuestions(questions: readonly Question[], facts: Facts): Question[] {
  return questions.filter((q) => q.when === undefined || q.when(facts));
}

/** A single structural problem found by `validateBank`. */
export interface BankError {
  phase: number;
  questionId?: string;
  code: 'duplicate-id' | 'missing-none' | 'options-required' | 'options-unexpected';
  message: string;
}

/**
 * The light runtime invariant check (§9.4). Pure — returns the full list of
 * problems rather than throwing, so tests can assert on the set and a startup
 * guard can decide policy. Checks:
 *   - question ids are unique across ALL phases;
 *   - every question carries the `none` prompt variant;
 *   - `select`/`multiselect` carry non-empty `options`;
 *   - other types carry no `options`.
 */
export function validateBank(phases: readonly Phase[]): BankError[] {
  const errors: BankError[] = [];
  const seen = new Set<string>();

  for (const phase of phases) {
    for (const q of phase.seed) {
      if (seen.has(q.id)) {
        errors.push({
          phase: phase.phase,
          questionId: q.id,
          code: 'duplicate-id',
          message: `Duplicate question id "${q.id}" — ids must be unique across all phases.`,
        });
      }
      seen.add(q.id);

      if (typeof q.prompt.none !== 'string' || q.prompt.none.length === 0) {
        errors.push({
          phase: phase.phase,
          questionId: q.id,
          code: 'missing-none',
          message: `Question "${q.id}" must carry a non-empty \`none\` prompt variant.`,
        });
      }

      const wantsOptions = q.type === 'select' || q.type === 'multiselect';
      const hasOptions = q.options !== undefined && q.options.length > 0;
      if (wantsOptions && !hasOptions) {
        errors.push({
          phase: phase.phase,
          questionId: q.id,
          code: 'options-required',
          message: `Question "${q.id}" is a ${q.type} and must carry non-empty \`options\`.`,
        });
      }
      if (!wantsOptions && q.options !== undefined) {
        errors.push({
          phase: phase.phase,
          questionId: q.id,
          code: 'options-unexpected',
          message: `Question "${q.id}" is a ${q.type} and must not carry \`options\`.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Throw-on-error wrapper over `validateBank` for the live `init`/`resume`
 * startup path, where a malformed bank should fail fast.
 */
export function assertBankValid(phases: readonly Phase[] = PHASES): void {
  const errors = validateBank(phases);
  if (errors.length > 0) {
    const detail = errors.map((e) => `  - [phase ${e.phase}] ${e.message}`).join('\n');
    throw new Error(`Invalid question bank:\n${detail}`);
  }
}

/** One question resolved for presentation — the unit of a rendered flow snapshot. */
export interface RenderedQuestion {
  id: string;
  type: Question['type'];
  prompt: string;
  help?: string;
  options?: readonly QuestionOption[];
}

/** A phase rendered for one literacy register against a fixed facts snapshot. */
export interface RenderedFlow {
  phase: number;
  literacy: Literacy;
  questions: RenderedQuestion[];
}

/**
 * Pure projection for the per-literacy snapshot tests (§10): apply `when`
 * against `facts`, then resolve each surviving question's prompt for `literacy`.
 * Deterministic — no I/O, no prompts, no LLM. Reused by every phase module's
 * snapshot test.
 */
export function renderQuestionFlow(phase: Phase, literacy: Literacy, facts: Facts): RenderedFlow {
  const questions = filterQuestions(phase.seed, facts).map<RenderedQuestion>((q) => ({
    id: q.id,
    type: q.type,
    prompt: resolvePrompt(q, literacy),
    ...(q.help !== undefined ? { help: q.help } : {}),
    ...(q.options !== undefined ? { options: q.options } : {}),
  }));

  return { phase: phase.phase, literacy, questions };
}
