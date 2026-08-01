import { describe, expect, it } from 'vitest';
import { renderAiLaws } from '../../src/render/markdown/ai-laws.js';
import { CapExceededError } from '../../src/render/markdown/caps.js';
import {
  type FrontmatterMeta,
  deriveSessionId,
  withFrontmatter,
} from '../../src/render/markdown/frontmatter.js';
import { renderManifesto } from '../../src/render/markdown/manifesto.js';
import type { ManifestoArtifact } from '../../src/schemas/manifesto.js';
import { makeSession } from './fixtures.js';

const META: FrontmatterMeta = {
  phase: 1,
  sessionId: 'sess12345678',
  generatedAt: '2026-08-01T00:00:00.000Z',
  mustardVersion: '0.1.0',
};

function manifesto(overrides: Partial<ManifestoArtifact> = {}): ManifestoArtifact {
  return {
    projectName: 'Habit Tracker',
    mission: 'People who want to build a daily habit have no simple, private place to track it.',
    values: [
      { title: 'Ship before perfect', rationale: 'A working slice beats a polished plan.' },
      {
        title: 'Stay true to your users',
        rationale: 'Every decision serves the person tracking a habit.',
      },
    ],
    aiLaws: ['Write tests alongside every feature.', 'Never add a dependency without asking.'],
    ...overrides,
  };
}

describe('renderManifesto', () => {
  it('renders values and mission under frontmatter', () => {
    expect(renderManifesto(manifesto(), META)).toMatchSnapshot();
  });

  it('throws CapExceededError when there are more than 10 values', () => {
    const values = Array.from({ length: 11 }, (_v, i) => ({
      title: `Rule ${i + 1}`,
      rationale: 'x',
    }));
    expect(() => renderManifesto(manifesto({ values }), META)).toThrow(CapExceededError);
  });
});

describe('renderAiLaws', () => {
  it('renders one law per line under frontmatter', () => {
    expect(renderAiLaws(manifesto(), META)).toMatchSnapshot();
  });

  it('throws CapExceededError when the rendered file exceeds 200 lines', () => {
    const aiLaws = Array.from({ length: 250 }, (_v, i) => `Law number ${i + 1}.`);
    expect(() => renderAiLaws(manifesto({ aiLaws }), META)).toThrow(CapExceededError);
  });
});

describe('frontmatter', () => {
  it('derives a stable session id from immutable session identity', () => {
    const session = makeSession();
    expect(deriveSessionId(session)).toBe(deriveSessionId(session));
    expect(deriveSessionId(session)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('emits the degraded flag only when set', () => {
    expect(withFrontmatter({ ...META, degraded: true }, '# X')).toContain('degraded: true');
    expect(withFrontmatter(META, '# X')).not.toContain('degraded:');
  });
});
