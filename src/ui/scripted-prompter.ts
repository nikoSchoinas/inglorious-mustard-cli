import {
  type ConfirmSpec,
  type EditorSpec,
  PromptCancelledError,
  type Prompter,
  type SelectSpec,
  type TextSpec,
} from './prompter.js';

/**
 * A pre-scripted answer, tagged with the prompt kind it answers. Tagging keeps a
 * mismatched script loud: a `text` step handed to `select()` throws rather than
 * silently returning the wrong value. A `cancel` step models the user hitting
 * Ctrl-C at that point.
 */
export type ScriptedStep =
  | { kind: 'select'; value: string }
  | { kind: 'multiselect'; value: string[] }
  | { kind: 'text'; value: string }
  | { kind: 'editor'; value: string }
  | { kind: 'confirm'; value: boolean }
  | { kind: 'cancel' };

/** A `cancel` step — reusable sentinel for readability in test scripts. */
export const CANCEL: ScriptedStep = { kind: 'cancel' };

/** Thrown when a prompt is requested but the script has no step left. */
export class ScriptExhaustedError extends Error {
  constructor(method: string) {
    super(`ScriptedPrompter: script exhausted — no answer for \`${method}\`.`);
    this.name = 'ScriptExhaustedError';
  }
}

/** Thrown when the next scripted step is for a different prompt kind. */
export class ScriptTypeMismatchError extends Error {
  constructor(expected: string, got: string) {
    super(`ScriptedPrompter: expected a \`${expected}\` answer but the script had \`${got}\`.`);
    this.name = 'ScriptTypeMismatchError';
  }
}

/** Thrown when a scripted text/editor answer fails the prompt's own validator. */
export class ScriptedValidationError extends Error {
  constructor(method: string, detail: string) {
    super(`ScriptedPrompter: scripted \`${method}\` answer rejected by validate: ${detail}`);
    this.name = 'ScriptedValidationError';
  }
}

/**
 * A `Prompter` that replays a fixed queue of answers — the seam that lets the
 * engine run in tests, golden runs and CI with no TTY (technical-plan §2.3).
 * `note` output is captured in `notes` for snapshotting. A `cancel` step throws
 * `PromptCancelledError`, exercising the same path a real Ctrl-C takes.
 */
export class ScriptedPrompter implements Prompter {
  private readonly queue: ScriptedStep[];
  /** Everything passed to `note`, in order — for assertions/snapshots. */
  readonly notes: Array<{ message: string; title?: string }> = [];

  constructor(script: readonly ScriptedStep[]) {
    this.queue = [...script];
  }

  /** Dequeue the next step, enforcing kind. A `cancel` step aborts the prompt. */
  private next<K extends ScriptedStep['kind']>(
    method: string,
    expected: K,
  ): Extract<ScriptedStep, { kind: K }> {
    const step = this.queue.shift();
    if (step === undefined) {
      throw new ScriptExhaustedError(method);
    }
    if (step.kind === 'cancel') {
      throw new PromptCancelledError();
    }
    if (step.kind !== expected) {
      throw new ScriptTypeMismatchError(expected, step.kind);
    }
    return step as Extract<ScriptedStep, { kind: K }>;
  }

  async select(_spec: SelectSpec): Promise<string> {
    return this.next('select', 'select').value;
  }

  async multiselect(_spec: SelectSpec): Promise<string[]> {
    return this.next('multiselect', 'multiselect').value;
  }

  async text(spec: TextSpec): Promise<string> {
    const value = this.next('text', 'text').value;
    this.assertValid('text', value, spec.validate);
    return value;
  }

  async editor(spec: EditorSpec): Promise<string> {
    const value = this.next('editor', 'editor').value;
    this.assertValid('editor', value, spec.validate);
    return value;
  }

  async confirm(_spec: ConfirmSpec): Promise<boolean> {
    return this.next('confirm', 'confirm').value;
  }

  note(message: string, title?: string): void {
    this.notes.push(title !== undefined ? { message, title } : { message });
  }

  /** A scripted answer that fails the prompt's validator is a broken script. */
  private assertValid(
    method: string,
    value: string,
    validate?: (v: string) => string | undefined,
  ): void {
    const error = validate?.(value);
    if (error !== undefined) {
      throw new ScriptedValidationError(method, error);
    }
  }
}
