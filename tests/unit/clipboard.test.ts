import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { type SpawnLike, copyToClipboard } from '../../src/ui/clipboard.js';

/**
 * The zero-dependency clipboard (spec §9.6): copying is best-effort and must NEVER
 * throw or fail the command. Everything is driven through an injected spawner so no
 * real clipboard tool is touched.
 */

/** A fake child that emits the given outcome on the next microtask. */
function fakeChild(outcome: (child: EventEmitter & { stdin: { end(): void } }) => void) {
  const child = new EventEmitter() as EventEmitter & { stdin: { end(): void } };
  child.stdin = { end: () => {} };
  queueMicrotask(() => outcome(child));
  return child;
}

function spawnWith(
  outcome: (child: EventEmitter & { stdin: { end(): void } }) => void,
  seen: string[] = [],
): SpawnLike {
  return ((command: string) => {
    seen.push(command);
    return fakeChild(outcome) as unknown as ReturnType<SpawnLike>;
  }) as SpawnLike;
}

describe('copyToClipboard', () => {
  it('returns true on a clean exit and uses pbcopy on macOS', async () => {
    const seen: string[] = [];
    const spawn = spawnWith((c) => c.emit('close', 0), seen);
    const ok = await copyToClipboard('hello', { platform: 'darwin', spawn });
    expect(ok).toBe(true);
    expect(seen).toEqual(['pbcopy']);
  });

  it('falls back to xclip when wl-copy fails on Linux', async () => {
    const seen: string[] = [];
    const spawn: SpawnLike = ((command: string) => {
      seen.push(command);
      // wl-copy errors (not installed); xclip exits cleanly.
      return fakeChild((c) =>
        command === 'wl-copy' ? c.emit('error', new Error('ENOENT')) : c.emit('close', 0),
      ) as unknown as ReturnType<SpawnLike>;
    }) as SpawnLike;
    const ok = await copyToClipboard('hello', { platform: 'linux', spawn });
    expect(ok).toBe(true);
    expect(seen).toEqual(['wl-copy', 'xclip']);
  });

  it('returns false (never throws) when no clipboard tool is present', async () => {
    const spawn = spawnWith((c) => c.emit('error', new Error('ENOENT')));
    const ok = await copyToClipboard('hello', { platform: 'linux', spawn });
    expect(ok).toBe(false);
  });

  it('returns false when the spawner itself throws', async () => {
    const spawn: SpawnLike = (() => {
      throw new Error('boom');
    }) as SpawnLike;
    const ok = await copyToClipboard('hello', { platform: 'darwin', spawn });
    expect(ok).toBe(false);
  });
});
