import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SessionError,
  backupPath,
  loadSession,
  mustardDir,
  saveSession,
  sessionExists,
  sessionPath,
} from '../../src/engine/session.js';
import { makeSession } from './fixtures.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mustard-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('saveSession / loadSession', () => {
  it('round-trips a session (bumping updatedAt, preserving createdAt)', () => {
    const original = makeSession();
    saveSession(original, dir);
    const loaded = loadSession(dir);

    expect(loaded.createdAt).toBe(original.createdAt);
    expect(loaded.projectName).toBe(original.projectName);
    expect(loaded.facts).toEqual(original.facts);
    // updatedAt is stamped at save time, so it differs from the in-memory fixture.
    expect(loaded.updatedAt).not.toBe(original.updatedAt);
  });

  it('creates mustard/ if absent and leaves no temp files', () => {
    expect(existsSync(mustardDir(dir))).toBe(false);
    saveSession(makeSession(), dir);
    expect(existsSync(sessionPath(dir))).toBe(true);
    const leftovers = readdirSync(mustardDir(dir)).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('reports existence', () => {
    expect(sessionExists(dir)).toBe(false);
    saveSession(makeSession(), dir);
    expect(sessionExists(dir)).toBe(true);
  });
});

describe('backup-before-mutation', () => {
  it('writes .bak holding the pre-mutation state on the second save', () => {
    const first = makeSession({ projectName: 'first' });
    saveSession(first, dir);
    // No .bak yet — nothing to back up on the very first write.
    expect(existsSync(backupPath(dir))).toBe(false);

    const second = makeSession({ projectName: 'second' });
    saveSession(second, dir);
    expect(existsSync(backupPath(dir))).toBe(true);

    const bak = JSON.parse(readFileSync(backupPath(dir), 'utf8')) as { projectName: string };
    const live = JSON.parse(readFileSync(sessionPath(dir), 'utf8')) as { projectName: string };
    expect(bak.projectName).toBe('first');
    expect(live.projectName).toBe('second');

    // Third save rolls the .bak forward to the previous (second) state.
    saveSession(makeSession({ projectName: 'third' }), dir);
    const bak2 = JSON.parse(readFileSync(backupPath(dir), 'utf8')) as { projectName: string };
    expect(bak2.projectName).toBe('second');
  });
});

describe('corruption recovery', () => {
  it('recovers truncated JSON from .bak', () => {
    saveSession(makeSession({ projectName: 'good' }), dir);
    saveSession(makeSession({ projectName: 'newer' }), dir); // creates a .bak of 'good'

    // Truncate the live file.
    const truncated = readFileSync(sessionPath(dir), 'utf8').slice(0, 20);
    writeFileSync(sessionPath(dir), truncated, 'utf8');

    const recovered = loadSession(dir);
    expect(recovered.projectName).toBe('good');
    // The heal is durable: the live file is valid again.
    expect(loadSession(dir).projectName).toBe('good');
  });

  it('recovers valid-JSON-but-invalid-shape from .bak', () => {
    saveSession(makeSession({ projectName: 'good' }), dir);
    saveSession(makeSession({ projectName: 'newer' }), dir);

    writeFileSync(sessionPath(dir), JSON.stringify({ schemaVersion: 1 }), 'utf8');
    expect(loadSession(dir).projectName).toBe('good');
  });

  it('throws unrecoverable (never returns an empty session) when no valid .bak exists', () => {
    saveSession(makeSession(), dir);
    writeFileSync(sessionPath(dir), '{ this is not json', 'utf8');

    try {
      loadSession(dir);
      expect.unreachable('loadSession should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionError);
      expect((err as SessionError).code).toBe('unrecoverable');
    }
  });

  it('throws unrecoverable when both the file and its .bak are corrupt', () => {
    saveSession(makeSession(), dir);
    saveSession(makeSession(), dir); // now a .bak exists
    writeFileSync(sessionPath(dir), 'garbage', 'utf8');
    writeFileSync(backupPath(dir), 'also garbage', 'utf8');

    expect(() => loadSession(dir)).toThrowError(SessionError);
  });

  it('throws not-found when no session exists', () => {
    try {
      loadSession(dir);
      expect.unreachable('loadSession should have thrown');
    } catch (err) {
      expect((err as SessionError).code).toBe('not-found');
    }
  });
});
