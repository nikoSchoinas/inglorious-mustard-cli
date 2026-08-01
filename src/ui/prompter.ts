import type { QuestionOption } from '../questions/types.js';

/**
 * The interactive seam (technical-plan §2.3, M3). Every terminal primitive the
 * engine needs sits behind this interface, so the M5 runner can be driven by a
 * real `@clack/prompts` implementation for humans OR a `ScriptedPrompter` that
 * replays canned answers — enabling golden runs, snapshot tests and CI with no
 * TTY and no API key.
 *
 * Methods are type-specific (not a single generic `ask`) so the runner gets a
 * precise return type per question kind. Spec types are kept deliberately thin:
 * the runner builds them from a `RenderedQuestion` (questions/index.ts) and, for
 * text/editor, derives `validate` from the bank's `EditorValidation` — the UI
 * never learns bank semantics.
 */

/** A `select` / `multiselect` prompt. `options` is exactly the bank's shape. */
export interface SelectSpec {
  message: string;
  help?: string;
  options: readonly QuestionOption[];
  /** Pre-highlighted value (`select`) — ignored by `multiselect`. */
  initialValue?: string;
}

/**
 * A validator, matching clack's convention: return an error string to reject and
 * re-prompt, or `undefined` to accept. The runner passes one derived from
 * `EditorValidation` (min words, one-per-line); the UI just enforces it.
 */
export type Validate = (value: string) => string | undefined;

/** A single-line `text` prompt. */
export interface TextSpec {
  message: string;
  help?: string;
  placeholder?: string;
  initialValue?: string;
  validate?: Validate;
}

/** A long-form `editor` prompt — opens `$EDITOR` in the real implementation. */
export interface EditorSpec {
  message: string;
  help?: string;
  /** Seed text placed in the editor buffer. */
  initial?: string;
  validate?: Validate;
}

/** A yes/no `confirm` prompt. */
export interface ConfirmSpec {
  message: string;
  help?: string;
  initialValue?: boolean;
}

/**
 * The interactive primitives. Implementations MUST translate a user cancellation
 * (Ctrl-C / Esc) into a thrown `PromptCancelledError`, never a sentinel value —
 * the single cancel contract the runner and the cancel handler rely on.
 */
export interface Prompter {
  select(spec: SelectSpec): Promise<string>;
  multiselect(spec: SelectSpec): Promise<string[]>;
  text(spec: TextSpec): Promise<string>;
  editor(spec: EditorSpec): Promise<string>;
  confirm(spec: ConfirmSpec): Promise<boolean>;
  /** Print a passive message (banners, review artifacts, the resume hint). */
  note(message: string, title?: string): void;
}

/**
 * Thrown when the user cancels a prompt (Ctrl-C / Esc). Funnelled — together
 * with a process `SIGINT` — through the cancel handler (ui/cancel.ts) into the
 * "answers already on disk, print `mustard resume`, exit 0" path (spec §9.8).
 * Mirrors the discriminated `SessionError` idiom in engine/session.ts.
 */
export class PromptCancelledError extends Error {
  constructor(message = 'Prompt cancelled by user.') {
    super(message);
    this.name = 'PromptCancelledError';
  }
}
