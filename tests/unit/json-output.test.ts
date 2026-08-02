import { describe, expect, it } from 'vitest';
import { formatModels } from '../../src/commands/config.js';
import { buildStatusJson, runStatus } from '../../src/commands/status.js';
import { BUNDLED_MANIFEST, ModelManifest, fetchRemoteManifest } from '../../src/llm/manifest.js';
import { StatusJson } from '../../src/schemas/cli-json.js';
import type { MustardConfig } from '../../src/schemas/config.js';
import { makeSession } from './fixtures.js';

/**
 * The `--json` query surfaces (spec §9.6, §11 v0.4): each payload must validate
 * against its schema so the future plugin/MCP surface has a stable contract.
 */

describe('status --json', () => {
  it('prints a payload that validates against StatusJson', async () => {
    const session = makeSession({
      projectName: 'Habit Tracker',
      tasks: [
        {
          id: 'T001',
          title: 'Setup',
          group: 'setup',
          useCaseIds: [],
          dependsOn: [],
          acceptanceCriteria: ['ok'],
          filesTouched: [],
          status: 'done',
        },
      ],
    });
    const printed: string[] = [];
    await runStatus({ json: true, load: () => session, print: (m) => printed.push(m) });
    const parsed = StatusJson.parse(JSON.parse(printed.join('\n')));
    expect(parsed.projectName).toBe('Habit Tracker');
    expect(parsed.tasks).toEqual({ done: 1, total: 1 });
  });

  it('buildStatusJson is pure and schema-valid', () => {
    expect(() => StatusJson.parse(buildStatusJson(makeSession()))).not.toThrow();
  });
});

describe('config models --list', () => {
  it('a fetched manifest validates against ModelManifest', async () => {
    const manifest = await fetchRemoteManifest({
      fetchImpl: (async () =>
        new Response(JSON.stringify(BUNDLED_MANIFEST))) as unknown as typeof fetch,
    });
    expect(() => ModelManifest.parse(manifest)).not.toThrow();
  });

  it('the bundled fallback is itself valid', () => {
    expect(() => ModelManifest.parse(BUNDLED_MANIFEST)).not.toThrow();
  });

  it('formatModels marks the current provider', () => {
    const config = { provider: 'openai' } as MustardConfig;
    const text = formatModels(BUNDLED_MANIFEST, config);
    expect(text).toContain('openai');
    expect(text).toMatch(/openai.*current/s);
  });
});
