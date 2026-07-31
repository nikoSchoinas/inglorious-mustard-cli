import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { MustardSession } from '../schemas/session.js';

/**
 * `mustard/.session.json` persistence — the "no work is ever lost" guarantee
 * (spec §7.3.1, §9.8). Every write is atomic (temp file + rename) and preceded
 * by a backup of the last known-good state to `.session.json.bak`, so a crash at
 * any point leaves both files valid. Corruption is repaired from the backup;
 * anything unrecoverable errors loudly and never silently discards.
 *
 * All paths derive from a `cwd` argument (default `process.cwd()`) so tests run
 * against isolated temp dirs. I/O is synchronous on purpose: persistence happens
 * at submit-time boundaries where the byte must hit disk before control returns,
 * and so the SIGINT handler (M3) can flush and exit without an event-loop turn.
 */

/** The schema version this build reads and writes. Bumped only alongside a migration. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Discriminated failure codes so callers and tests branch on `code`, not messages. */
export type SessionErrorCode =
  | 'not-found' // no .session.json exists
  | 'unrecoverable' // .session.json corrupt and no valid .bak
  | 'unknown-schema-version'; // a future/unknown schemaVersion — not corruption

export class SessionError extends Error {
  readonly code: SessionErrorCode;

  constructor(code: SessionErrorCode, message: string) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
  }
}

export function mustardDir(cwd: string = process.cwd()): string {
  return join(cwd, 'mustard');
}

export function sessionPath(cwd: string = process.cwd()): string {
  return join(mustardDir(cwd), '.session.json');
}

export function backupPath(cwd: string = process.cwd()): string {
  return join(mustardDir(cwd), '.session.json.bak');
}

/** True when a session already exists — drives `init` refusal / `resume` (§9.6). */
export function sessionExists(cwd: string = process.cwd()): boolean {
  return existsSync(sessionPath(cwd));
}

function ensureMustardDir(cwd: string): void {
  mkdirSync(mustardDir(cwd), { recursive: true });
}

/**
 * Migrate a raw parsed object up to `CURRENT_SCHEMA_VERSION`. A missing or
 * non-numeric version is treated as corruption (returns null → repair path). A
 * future version errors loudly and is never downgraded or discarded (§9.8).
 * The v1 identity migration is a real registered step, so the mechanism runs
 * even in the steady state.
 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const migrations: Record<number, Migration> = {
  // v1 → v1: identity. Proves the registry is exercised at the current version.
  1: (raw) => raw,
};

export function migrate(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const version = record.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return null; // garbage/absent version → corrupt, let the repair path handle it
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new SessionError(
      'unknown-schema-version',
      `Session schemaVersion ${version} is newer than this build supports (${CURRENT_SCHEMA_VERSION}). Upgrade inglorious-mustard to continue.`,
    );
  }

  let current = record;
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v];
    if (!step) {
      throw new SessionError(
        'unknown-schema-version',
        `No migration registered from schemaVersion ${v}.`,
      );
    }
    current = step(current);
  }
  // Run the current-version step (identity at v1) so the registry is always exercised.
  const finalStep = migrations[CURRENT_SCHEMA_VERSION];
  return finalStep ? finalStep(current) : current;
}

/** Parse + migrate + validate raw file text. Returns null on any corruption. */
function tryDeserialize(text: string): MustardSession | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const migrated = migrate(raw); // may throw SessionError('unknown-schema-version')
  if (migrated === null) {
    return null;
  }
  const parsed = MustardSession.safeParse(migrated);
  return parsed.success ? parsed.data : null;
}

/** Write `session` atomically: serialise to a unique temp file, then rename onto the target. */
function atomicWrite(path: string, session: MustardSession, cwd: string): void {
  ensureMustardDir(cwd);
  const tmpPath = join(mustardDir(cwd), `.session.json.${process.pid}.${Date.now()}.tmp`);
  try {
    // Pretty-printed with a trailing newline: human-readable and diffable in PRs (§9.1).
    writeFileSync(tmpPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    renameSync(tmpPath, path);
  } finally {
    if (existsSync(tmpPath)) {
      rmSync(tmpPath, { force: true });
    }
  }
}

/**
 * Load and validate the session. On corruption (unparseable, or valid JSON that
 * fails the schema) it repairs from `.session.json.bak` and re-persists the
 * recovered state durably. If the backup is absent or also corrupt it throws
 * `unrecoverable` — it never returns a fresh empty session (§9.8).
 */
export function loadSession(cwd: string = process.cwd()): MustardSession {
  const path = sessionPath(cwd);
  if (!existsSync(path)) {
    throw new SessionError('not-found', `No session at ${path}. Run \`mustard init\` first.`);
  }

  // `migrate` may throw unknown-schema-version here — that is deliberately not
  // treated as corruption and must not trigger a .bak repair.
  const primary = tryDeserialize(readFileSync(path, 'utf8'));
  if (primary) {
    return primary;
  }

  // Primary is corrupt — attempt repair from the backup.
  const bak = backupPath(cwd);
  if (existsSync(bak)) {
    const recovered = tryDeserialize(readFileSync(bak, 'utf8'));
    if (recovered) {
      // Heal on disk so the recovery is durable. Do not touch the still-good .bak.
      atomicWrite(path, recovered, cwd);
      return recovered;
    }
  }

  throw new SessionError(
    'unrecoverable',
    `Session at ${path} is corrupt and no valid backup was found. You can restart the current phase.`,
  );
}

/**
 * Persist the session. Backs up the current on-disk state to `.bak` first, then
 * bumps `updatedAt`, validates, and writes atomically — so a crash between steps
 * leaves both `.session.json` and `.bak` valid. `createdAt` is never touched.
 */
export function saveSession(session: MustardSession, cwd: string = process.cwd()): MustardSession {
  ensureMustardDir(cwd);
  const path = sessionPath(cwd);

  // 1. Back up the last known-good state before overwriting it.
  if (existsSync(path)) {
    copyFileSync(path, backupPath(cwd));
  }

  // 2. Bump updatedAt on a clone — saveSession has no surprising side effects.
  const next: MustardSession = { ...session, updatedAt: new Date().toISOString() };

  // 3. Validate before writing — never persist an invalid session.
  const validated = MustardSession.parse(next);

  // 4. Atomic write.
  atomicWrite(path, validated, cwd);
  return validated;
}
