import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const entry = fileURLToPath(new URL('../../src/index.ts', import.meta.url));

const EXPECTED_COMMANDS = ['init', 'resume', 'status', 'phase', 'prompts', 'export', 'config'];

describe('cli scaffold', () => {
  it('reports the package version', () => {
    expect(buildProgram().version()).toBe(pkg.version);
  });

  it('registers every documented subcommand (spec §9.6)', () => {
    const names = buildProgram().commands.map((c) => c.name());
    for (const expected of EXPECTED_COMMANDS) {
      expect(names).toContain(expected);
    }
  });

  it('exposes the global flags', () => {
    const flags = buildProgram()
      .options.map((o) => o.long)
      .filter(Boolean);
    expect(flags).toEqual(expect.arrayContaining(['--no-color', '--json', '--dry-run']));
  });

  it('prints the version when invoked as a process', () => {
    const out = execFileSync('npx', ['tsx', entry, '--version'], {
      encoding: 'utf8',
    }).trim();
    expect(out).toBe(pkg.version);
  });
});
