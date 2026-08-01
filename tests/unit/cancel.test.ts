import { describe, expect, it, vi } from 'vitest';
import { handleCancellation, installCancelHandler } from '../../src/ui/cancel.js';
import { PromptCancelledError } from '../../src/ui/prompter.js';
import { CANCEL, ScriptedPrompter } from '../../src/ui/scripted-prompter.js';

/** A non-terminating `exit` spy typed as `never` so it can be injected. */
function fakeExit() {
  const codes: number[] = [];
  const exit = ((code: number) => {
    codes.push(code);
  }) as (code: number) => never;
  return { exit, codes };
}

describe('handleCancellation', () => {
  it('translates a clack cancel into flush → hint → exit 0', async () => {
    // A scripted cancel throws PromptCancelledError, exactly like a real Ctrl-C.
    let thrown: unknown;
    try {
      await new ScriptedPrompter([CANCEL]).confirm({ message: 'sure?' });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PromptCancelledError);

    const onFlush = vi.fn();
    const print = vi.fn();
    const { exit, codes } = fakeExit();
    handleCancellation(thrown, { onFlush, print, exit, resumeHint: 'run mustard resume' });

    expect(onFlush).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledWith('run mustard resume');
    expect(codes).toEqual([0]);
  });

  it('rethrows a non-cancel error untouched', () => {
    const boom = new Error('network down');
    expect(() => handleCancellation(boom, {})).toThrow(boom);
  });

  it('prints the default resume hint when none is given', () => {
    const print = vi.fn();
    const { exit } = fakeExit();
    handleCancellation(new PromptCancelledError(), { print, exit });
    expect(print).toHaveBeenCalledWith(expect.stringContaining('mustard resume'));
  });
});

describe('installCancelHandler (process SIGINT)', () => {
  it('registers a SIGINT listener that takes the clean-exit path, and disposes it', () => {
    const onFlush = vi.fn();
    const print = vi.fn();
    const { exit, codes } = fakeExit();

    const before = process.listeners('SIGINT').length;
    const dispose = installCancelHandler({ onFlush, print, exit, resumeHint: 'bye' });

    const listeners = process.listeners('SIGINT');
    expect(listeners.length).toBe(before + 1);

    // Invoke our listener directly — avoids disturbing any other SIGINT handler.
    (listeners[listeners.length - 1] as () => void)();
    expect(onFlush).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledWith('bye');
    expect(codes).toEqual([0]);

    dispose();
    expect(process.listeners('SIGINT').length).toBe(before);
  });
});
