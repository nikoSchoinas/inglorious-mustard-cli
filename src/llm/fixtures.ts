import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Fixture keying for the record/replay transport (technical-plan §2.3). A fixture
 * is addressed by `(pass, promptVersion, schemaHash, inputHash)` so that any drift
 * in the output schema or the system prompt changes the key and produces a loud
 * replay cache-miss — never a silent replay of a stale answer against changed
 * instructions. This is the single guarantee that keeps replay tests honest as the
 * codebase evolves.
 */

export interface FixtureKeyInput {
  pass: string;
  promptVersion: string;
  /** The Zod output schema — hashed via its JSON Schema projection. */
  schema: z.ZodType;
  /** The structured pass input — hashed canonically (key order irrelevant). */
  input: unknown;
}

export interface FixtureKey {
  pass: string;
  promptVersion: string;
  schemaHash: string;
  inputHash: string;
}

/** Deterministic JSON: object keys sorted recursively so key order never affects the hash. */
function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Hash the schema by its JSON Schema projection (`z.toJSONSchema`, zod v4) rather
 * than any internal representation, so the hash tracks the *contract* the model
 * must satisfy. A field added, removed, or retyped changes this hash.
 */
export function schemaHash(schema: z.ZodType): string {
  return sha256(canonicalize(z.toJSONSchema(schema)));
}

export function computeFixtureKey(input: FixtureKeyInput): FixtureKey {
  return {
    pass: input.pass,
    promptVersion: input.promptVersion,
    schemaHash: schemaHash(input.schema),
    inputHash: sha256(canonicalize(input.input)),
  };
}

/** Default fixtures root: `<projectRoot>/tests/fixtures` (works from `src/` and `dist/`). */
export function defaultFixturesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // src/llm or dist/llm
  return join(here, '..', '..', 'tests', 'fixtures');
}

/** Filenames use 16-hex-char slices of each hash — 64 bits, collision-safe in practice. */
function slice(hash: string): string {
  return hash.slice(0, 16);
}

export function fixtureFilePath(root: string, key: FixtureKey): string {
  const name = `${key.promptVersion}.${slice(key.schemaHash)}.${slice(key.inputHash)}.json`;
  return join(root, key.pass, name);
}

export interface FixtureFile {
  pass: string;
  promptVersion: string;
  schemaHash: string;
  inputHash: string;
  /** The recorded structured input, for human debugging of a fixture. */
  recordedInput: unknown;
  /** The validated object the model returned. */
  response: unknown;
}

/** Read a recorded response, or null on cache miss. Callers turn null into a loud error. */
export function readFixture(root: string, key: FixtureKey): FixtureFile | null {
  const path = fixtureFilePath(root, key);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8')) as FixtureFile;
}

/** Persist a recorded response under its computed key. */
export function writeFixture(
  root: string,
  key: FixtureKey,
  recordedInput: unknown,
  response: unknown,
): void {
  const path = fixtureFilePath(root, key);
  mkdirSync(dirname(path), { recursive: true });
  const payload: FixtureFile = {
    pass: key.pass,
    promptVersion: key.promptVersion,
    schemaHash: key.schemaHash,
    inputHash: key.inputHash,
    recordedInput,
    response,
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
