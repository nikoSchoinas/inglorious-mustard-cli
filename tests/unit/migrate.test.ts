import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SessionError,
  loadSession,
  migrate,
  mustardDir,
  sessionPath,
} from '../../src/engine/session.js';
import { makeSession } from './fixtures.js';

describe('migrate', () => {
  it('runs the v1 identity migration for a current-version session', () => {
    const session = makeSession();
    const result = migrate(JSON.parse(JSON.stringify(session)));
    expect(result).not.toBeNull();
    expect(result?.schemaVersion).toBe(1);
    expect(result?.projectName).toBe('Habit Tracker');
  });

  it('treats a missing or non-numeric schemaVersion as corrupt (returns null)', () => {
    expect(migrate({ projectName: 'x' })).toBeNull();
    expect(migrate({ schemaVersion: '1', projectName: 'x' })).toBeNull();
    expect(migrate({ schemaVersion: 1.5, projectName: 'x' })).toBeNull();
    expect(migrate(null)).toBeNull();
    expect(migrate('nope')).toBeNull();
  });

  it('throws unknown-schema-version for a future version', () => {
    try {
      migrate({ schemaVersion: 2, projectName: 'x' });
      expect.unreachable('migrate should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionError);
      expect((err as SessionError).code).toBe('unknown-schema-version');
    }
  });
});

describe('loadSession + schema version', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mustard-'));
    mkdirSync(mustardDir(dir), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('errors loudly on a future version and does not fall through to .bak repair', () => {
    // A structurally-valid future session — not corruption.
    const future = { ...makeSession(), schemaVersion: 2 };
    writeFileSync(sessionPath(dir), JSON.stringify(future), 'utf8');

    try {
      loadSession(dir);
      expect.unreachable('loadSession should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionError);
      // Not 'unrecoverable' — the version branch must win over the repair path.
      expect((err as SessionError).code).toBe('unknown-schema-version');
    }
  });
});
