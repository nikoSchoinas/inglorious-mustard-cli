import {
  confirm as clackConfirm,
  multiselect as clackMultiselect,
  note as clackNote,
  select as clackSelect,
  text as clackText,
  isCancel,
} from '@clack/prompts';
import { pc } from './color.js';
import { type EditorLauncher, defaultEditorLauncher } from './editor.js';
import {
  type ConfirmSpec,
  type EditorSpec,
  PromptCancelledError,
  type Prompter,
  type SelectSpec,
  type TextSpec,
} from './prompter.js';

/**
 * The real `Prompter`, over `@clack/prompts` (spec §9.1: purpose-built for
 * sequential wizards). Every method funnels a clack cancel symbol through the
 * single `unwrap` translation point into a `PromptCancelledError`, so the cancel
 * handler (ui/cancel.ts) sees one contract regardless of which prompt was open.
 *
 * `editor()` delegates to an injectable `EditorLauncher` rather than a clack
 * primitive (clack has none) — swappable in tests.
 */
export class ClackPrompter implements Prompter {
  private readonly launcher: EditorLauncher;

  constructor(opts: { launcher?: EditorLauncher } = {}) {
    this.launcher = opts.launcher ?? defaultEditorLauncher;
  }

  /** Throw on cancel; otherwise return the value with its type narrowed. */
  private unwrap<T>(result: T | symbol): T {
    if (isCancel(result)) {
      throw new PromptCancelledError();
    }
    return result as T;
  }

  /** Fold optional `help` into the message as a dimmed second line. */
  private withHelp(message: string, help?: string): string {
    return help ? `${message}\n${pc.dim(help)}` : message;
  }

  async select(spec: SelectSpec): Promise<string> {
    const result = await clackSelect({
      message: this.withHelp(spec.message, spec.help),
      options: spec.options.map((o) => ({ value: o.value, label: o.label })),
      ...(spec.initialValue !== undefined ? { initialValue: spec.initialValue } : {}),
    });
    return this.unwrap(result);
  }

  async multiselect(spec: SelectSpec): Promise<string[]> {
    const result = await clackMultiselect({
      message: this.withHelp(spec.message, spec.help),
      options: spec.options.map((o) => ({ value: o.value, label: o.label })),
      required: false,
    });
    return this.unwrap(result);
  }

  async text(spec: TextSpec): Promise<string> {
    // clack's validator receives `string | undefined`; our contract is `string`.
    const { validate } = spec;
    const result = await clackText({
      message: this.withHelp(spec.message, spec.help),
      ...(spec.placeholder !== undefined ? { placeholder: spec.placeholder } : {}),
      ...(spec.initialValue !== undefined ? { initialValue: spec.initialValue } : {}),
      ...(validate ? { validate: (value: string | undefined) => validate(value ?? '') } : {}),
    });
    return this.unwrap(result);
  }

  async editor(spec: EditorSpec): Promise<string> {
    // Announce, then hand the terminal to the user's editor, then validate.
    clackNote(this.withHelp(spec.message, spec.help));
    for (;;) {
      const value = await this.launcher.launch(spec.initial ?? '');
      const error = spec.validate?.(value);
      if (error === undefined) {
        return value;
      }
      clackNote(pc.yellow(error));
    }
  }

  async confirm(spec: ConfirmSpec): Promise<boolean> {
    const result = await clackConfirm({
      message: this.withHelp(spec.message, spec.help),
      ...(spec.initialValue !== undefined ? { initialValue: spec.initialValue } : {}),
    });
    return this.unwrap(result);
  }

  note(message: string, title?: string): void {
    clackNote(message, title);
  }
}
