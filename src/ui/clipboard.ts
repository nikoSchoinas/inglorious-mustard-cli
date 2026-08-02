import { type SpawnOptions, spawn as nodeSpawn } from 'node:child_process';

/**
 * Best-effort clipboard copy for `mustard prompts` (spec §9.6). Zero new
 * dependencies: it shells out to the platform's native clipboard tool. Copying is a
 * convenience, never a requirement — so this NEVER throws and NEVER fails the
 * command; it returns `false` when no clipboard tool is present (e.g. a headless
 * Linux box with neither `wl-copy` nor `xclip`), and the caller prints a "copy the
 * text above" note instead (spec §9.6: "never fail the command when no clipboard
 * exists").
 */

/** Minimal shape of the spawner we depend on — the subset `copyToClipboard` uses. */
export type SpawnLike = (
  command: string,
  args: readonly string[],
  options?: SpawnOptions,
) => ReturnType<typeof nodeSpawn>;

export interface ClipboardOptions {
  /** Override the detected platform (tests). Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Injected spawner (tests). Defaults to `node:child_process` spawn. */
  spawn?: SpawnLike;
}

/** The ordered clipboard-tool candidates to try for a platform. First success wins. */
function candidates(platform: NodeJS.Platform): Array<readonly [string, ...string[]]> {
  switch (platform) {
    case 'darwin':
      return [['pbcopy']];
    case 'win32':
      return [['clip']];
    default:
      // Wayland first, then X11. Whichever is installed answers.
      return [['wl-copy'], ['xclip', '-selection', 'clipboard']];
  }
}

/** Try one clipboard tool. Resolves `true` only on a clean (code 0) exit. */
function tryCopy(
  spawn: SpawnLike,
  command: string,
  args: readonly string[],
  text: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof nodeSpawn>;
    try {
      child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch {
      resolve(false);
      return;
    }
    // A missing binary surfaces as an async 'error' (ENOENT), not a throw.
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    try {
      child.stdin?.end(text);
    } catch {
      resolve(false);
    }
  });
}

/** Copy `text` to the system clipboard. Returns whether it succeeded; never throws. */
export async function copyToClipboard(text: string, opts: ClipboardOptions = {}): Promise<boolean> {
  const platform = opts.platform ?? process.platform;
  const spawn = opts.spawn ?? (nodeSpawn as SpawnLike);
  for (const [command, ...args] of candidates(platform)) {
    if (await tryCopy(spawn, command, args, text)) {
      return true;
    }
  }
  return false;
}
