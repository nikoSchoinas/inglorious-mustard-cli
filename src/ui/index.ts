/**
 * Public surface of the UI layer (M3) — the interactive seam the engine drives.
 * The rest of the app imports from here, not from individual files.
 */
export { renderBanner, showBanner } from './banner.js';
export { type CancelOptions, handleCancellation, installCancelHandler } from './cancel.js';
export { ClackPrompter } from './clack-prompter.js';
export { configureColor, pc } from './color.js';
export { type EditorLauncher, defaultEditorLauncher } from './editor.js';
export {
  type ConfirmSpec,
  type EditorSpec,
  type Prompter,
  PromptCancelledError,
  type SelectSpec,
  type TextSpec,
  type Validate,
} from './prompter.js';
export { type ReviewChoice, reviewGate } from './review-gate.js';
export {
  CANCEL,
  ScriptExhaustedError,
  ScriptedPrompter,
  ScriptedValidationError,
  type ScriptedStep,
  ScriptTypeMismatchError,
} from './scripted-prompter.js';
