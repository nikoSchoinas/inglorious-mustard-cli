import { startMustardSpinner } from '../ui/spinner.js';
import { type LLMMode, modeFromEnv } from './transport.js';

/**
 * The `LLMClient.onActivityStart` hook for a real, interactive run. Returns the
 * mustard spinner starter only when stdout is a TTY and we're actually hitting a
 * provider (`real`/`record`) — never in `replay` or piped output, so replay
 * fixtures and test snapshots stay free of spinner escape codes.
 */
export function activityHook(mode: LLMMode = modeFromEnv()): (() => () => void) | undefined {
  const interactive = Boolean(process.stdout.isTTY) && (mode === 'real' || mode === 'record');
  return interactive ? startMustardSpinner : undefined;
}
