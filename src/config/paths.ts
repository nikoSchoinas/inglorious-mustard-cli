import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MustardConfig } from '../schemas/config.js';

/**
 * Provider config at `~/.mustard/config.json` (spec §9.5). This file may hold an
 * API key (when `apiKeySource === 'config'`), so it is created and rewritten with
 * mode `0600` — owner read/write only. Writes are atomic (temp file + rename, the
 * same idiom as `engine/session.ts`) so a crash never leaves a half-written key on
 * disk. All paths derive from a `home` argument (default `os.homedir()`) so tests
 * run against isolated temp dirs.
 */

const OWNER_ONLY = 0o600;
const OWNER_DIR = 0o700;

export function configDir(home: string = homedir()): string {
  return join(home, '.mustard');
}

export function configPath(home: string = homedir()): string {
  return join(configDir(home), 'config.json');
}

export function configExists(home: string = homedir()): boolean {
  return existsSync(configPath(home));
}

function ensureConfigDir(home: string): void {
  mkdirSync(configDir(home), { recursive: true, mode: OWNER_DIR });
}

/**
 * Load and validate the config. Returns null when the file is absent (a fresh
 * install — the caller runs first-time setup). Throws on a present-but-corrupt
 * file: unlike the session, there is no backup to repair from, and silently
 * discarding a user's provider/key would be worse than a loud error.
 */
export function loadConfig(home: string = homedir()): MustardConfig | null {
  const path = configPath(home);
  if (!existsSync(path)) {
    return null;
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return MustardConfig.parse(raw);
}

/** Validate and persist the config atomically with owner-only permissions. */
export function saveConfig(config: MustardConfig, home: string = homedir()): MustardConfig {
  const validated = MustardConfig.parse(config);
  ensureConfigDir(home);
  const path = configPath(home);
  const tmpPath = join(configDir(home), `config.json.${process.pid}.${Date.now()}.tmp`);
  try {
    // Create the temp file already locked down, so the key is never briefly
    // world-readable between write and chmod.
    writeFileSync(tmpPath, `${JSON.stringify(validated, null, 2)}\n`, {
      encoding: 'utf8',
      mode: OWNER_ONLY,
    });
    renameSync(tmpPath, path);
  } finally {
    if (existsSync(tmpPath)) {
      rmSync(tmpPath, { force: true });
    }
  }
  return validated;
}
