import { describe, expect, it } from 'vitest';
import { renderAiLaws } from '../../src/render/markdown/ai-laws.js';
import type { FrontmatterMeta } from '../../src/render/markdown/frontmatter.js';
import { renderManifesto } from '../../src/render/markdown/manifesto.js';
import { createRendererRegistry } from '../../src/render/register.js';
import { RendererRegistry, defineRenderer } from '../../src/render/registry.js';
import { ManifestoArtifact } from '../../src/schemas/manifesto.js';

const META: FrontmatterMeta = {
  phase: 1,
  sessionId: 'sess12345678',
  generatedAt: '2026-08-01T00:00:00.000Z',
  mustardVersion: '0.1.0',
};

const MANIFESTO: ManifestoArtifact = {
  projectName: 'Habit Tracker',
  mission: 'People who want to build a daily habit have no simple, private place to track it.',
  values: [{ title: 'Ship before perfect', rationale: 'A working slice beats a polished plan.' }],
  aiLaws: ['Write tests alongside every feature.'],
};

describe('createRendererRegistry', () => {
  it('registers the two Phase 1 artifacts', () => {
    const reg = createRendererRegistry();
    expect(reg.has('01-MANIFESTO.md')).toBe(true);
    expect(reg.has('01-AI-LAWS.md')).toBe(true);
  });

  it('renders byte-identically to calling the renderer directly (rewire guard)', () => {
    const reg = createRendererRegistry();
    expect(reg.render('01-MANIFESTO.md', MANIFESTO, META).body).toBe(
      renderManifesto(MANIFESTO, META),
    );
    expect(reg.render('01-AI-LAWS.md', MANIFESTO, META).body).toBe(renderAiLaws(MANIFESTO, META));
  });

  it('renderAll preserves order and names', () => {
    const reg = createRendererRegistry();
    const out = reg.renderAll(['01-MANIFESTO.md', '01-AI-LAWS.md'], MANIFESTO, META);
    expect(out.map((a) => a.name)).toEqual(['01-MANIFESTO.md', '01-AI-LAWS.md']);
  });
});

describe('RendererRegistry error handling', () => {
  it('throws on an unregistered artifact name', () => {
    expect(() => createRendererRegistry().render('99-NOPE.md', {}, META)).toThrow();
  });

  it('throws on duplicate registration', () => {
    const def = defineRenderer('01-MANIFESTO.md', ManifestoArtifact, renderManifesto);
    expect(() => new RendererRegistry().register([def, def])).toThrow();
  });

  it('throws when handed the wrong object (schema.parse guards the narrow)', () => {
    expect(() =>
      createRendererRegistry().render('01-MANIFESTO.md', { nope: true }, META),
    ).toThrow();
  });

  it('propagates CapExceededError from the renderer', () => {
    const tooMany: ManifestoArtifact = {
      ...MANIFESTO,
      values: Array.from({ length: 11 }, (_v, i) => ({ title: `Rule ${i + 1}`, rationale: 'x' })),
    };
    expect(() => createRendererRegistry().render('01-MANIFESTO.md', tooMany, META)).toThrow();
  });
});
