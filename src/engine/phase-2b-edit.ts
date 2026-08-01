import type { FailurePath } from '../llm/passes/failure-structure.js';
import type { HappyStep } from '../llm/passes/happy-path.js';
import type { DomainExtraction } from '../schemas/extraction.js';
import type { Phase2Output } from '../schemas/phase2-output.js';
import type { UseCase } from '../schemas/use-case.js';
import { nextId } from './phase-2a-edit.js';

/**
 * Pure, immutable helpers for the Phase 2 part-B flow (spec §8.5 steps 5–8),
 * factored out of the orchestrator so they are unit-testable without a prompter or
 * an LLM. Each returns a fresh `Phase2Output` (via `structuredClone`); use-case ids
 * are minted gap-free with the shared `nextId` (reused from part A) and never
 * renumbered, so Phase 3's references stay stable (technical-plan §5, M9 risk).
 */

/**
 * Seed one use case per confirmed capability (§8.5 step 5 preamble). The title is
 * the capability's `verb object`; happy path, failure paths, preconditions and
 * dependencies start empty and are filled by the interrogation.
 */
export function seedUseCases(extraction: DomainExtraction): UseCase[] {
  const useCases: UseCase[] = [];
  for (const cap of extraction.capabilities) {
    const id = nextId(
      'uc',
      useCases.map((u) => u.id),
    );
    const title = `${cap.verb} ${cap.object}`.trim() || cap.description || cap.id;
    useCases.push({
      id,
      title,
      actorId: cap.actorId,
      preconditions: [],
      happyPath: [],
      failurePaths: [],
      dependsOn: [],
    });
  }
  return useCases;
}

/** Wrap the part-A `DomainExtraction` into the initial part-B output container. */
export function wrapExtraction(extraction: DomainExtraction): Phase2Output {
  return {
    extraction: structuredClone(extraction),
    useCases: seedUseCases(extraction),
    dependencyOrder: [],
    screens: { approach: '', screens: [] },
  };
}

/** Set the happy path of one use case, leaving every other field untouched. */
export function setHappyPath(
  output: Phase2Output,
  useCaseId: string,
  happyPath: readonly HappyStep[],
): Phase2Output {
  return mapUseCase(output, useCaseId, (uc) => ({
    ...uc,
    happyPath: structuredClone([...happyPath]),
  }));
}

/** Set the failure paths of one use case. */
export function setFailurePaths(
  output: Phase2Output,
  useCaseId: string,
  failurePaths: readonly FailurePath[],
): Phase2Output {
  return mapUseCase(output, useCaseId, (uc) => ({
    ...uc,
    failurePaths: structuredClone([...failurePaths]),
  }));
}

/** Record the confirmed build order (ordered use-case ids). */
export function setDependencyOrder(output: Phase2Output, order: readonly string[]): Phase2Output {
  const next = structuredClone(output);
  next.dependencyOrder = [...order];
  return next;
}

/** Record the UI step's design approach and screen inventory. */
export function setScreens(
  output: Phase2Output,
  approach: string,
  screens: readonly string[],
): Phase2Output {
  const next = structuredClone(output);
  next.screens = { approach, screens: dedupe(screens) };
  return next;
}

/**
 * Parse a hand-edited happy path back into steps. Each non-empty line is
 * `actor: action`; a line without a recognised actor prefix is treated as a `user`
 * action. Tolerant by design — a user editing in `$EDITOR` should never be able to
 * produce an unparseable path.
 */
export function parseHappyPathText(text: string): HappyStep[] {
  const steps: HappyStep[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) {
      continue;
    }
    const match = /^(user|system|database|external)\s*:\s*(.+)$/i.exec(line);
    if (match) {
      steps.push({
        actor: match[1]?.toLowerCase() as HappyStep['actor'],
        action: (match[2] ?? '').trim(),
      });
    } else {
      steps.push({ actor: 'user', action: line });
    }
  }
  return steps;
}

/** Render steps for the `$EDITOR` buffer as `actor: action` lines. */
export function renderHappyPathForEdit(steps: readonly HappyStep[]): string {
  return steps.map((s) => `${s.actor}: ${s.action}`).join('\n');
}

/**
 * Derive candidate screen names deterministically from the use cases (§8.5 step 8
 * — "screen inventory, not designs"). One screen per use-case title, plus the
 * near-universal Sign in / Settings surfaces, de-duplicated case-insensitively.
 */
export function deriveScreens(useCases: readonly UseCase[]): string[] {
  const names = useCases.map((uc) => capitalise(uc.title));
  return dedupe([...names, 'Sign in', 'Settings']);
}

/** The generic failure path used when the interrogation yields nothing, so every
 * use case ends with at least one failure path (technical-plan §5, M9 acceptance). */
export function fallbackFailurePath(): FailurePath {
  return {
    trigger: 'an unexpected error occurs',
    systemResponse: 'log the error and fail safely without corrupting data',
    userVisible: 'a clear message that something went wrong and to try again',
  };
}

// --------------------------------------------------------------------------
// internal
// --------------------------------------------------------------------------

function mapUseCase(
  output: Phase2Output,
  useCaseId: string,
  fn: (uc: UseCase) => UseCase,
): Phase2Output {
  const next = structuredClone(output);
  next.useCases = next.useCases.map((uc) => (uc.id === useCaseId ? fn(uc) : uc));
  return next;
}

/** De-duplicate case-insensitively, preserving first occurrence and its casing. */
function dedupe(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function capitalise(text: string): string {
  const trimmed = text.trim();
  return trimmed.length === 0 ? trimmed : trimmed[0]?.toUpperCase() + trimmed.slice(1);
}
