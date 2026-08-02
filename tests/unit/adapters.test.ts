import { describe, expect, it } from 'vitest';
import {
  type AdapterContext,
  adapterPathFor,
  buildAdapterBody,
  writeAdapter,
} from '../../src/render/adapters/index.js';
import { memoryAdapterIO } from '../../src/render/adapters/io.js';
import { BEGIN, END } from '../../src/render/adapters/sentinel.js';
import type { MustardSession } from '../../src/schemas/session.js';

const CTX: AdapterContext = {
  projectName: 'Habit Tracker',
  mission: 'Help one person build a daily habit and see their streak.',
  aiLaws: ['Ship before perfect.', 'Tests alongside every feature.', 'No unrequested files.'],
};

type AgentTarget = MustardSession['agentTarget'];

describe('adapter path mapping (§3.2)', () => {
  it('maps each agent target to its file, with AGENTS.md as the fallback', () => {
    expect(adapterPathFor('claude-code')).toBe('CLAUDE.md');
    expect(adapterPathFor('codex')).toBe('AGENTS.md');
    expect(adapterPathFor('cursor')).toBe('.cursor/rules/mustard.mdc');
    expect(adapterPathFor('copilot')).toBe('.github/copilot-instructions.md');
    expect(adapterPathFor('gemini-cli')).toBe('GEMINI.md');
    // The open-standard fallback for the undecided/other/antigravity targets.
    for (const target of ['antigravity', 'other', 'undecided'] as const) {
      expect(adapterPathFor(target)).toBe('AGENTS.md');
    }
  });
});

describe('buildAdapterBody', () => {
  it('inlines the mission, the AI-LAWS, and the bundle pointers', () => {
    const body = buildAdapterBody(CTX);
    expect(body).toContain('# Habit Tracker — AI agent guide');
    expect(body).toContain('Help one person build a daily habit');
    expect(body).toContain('- Ship before perfect.');
    expect(body).toContain('`mustard/06-ROADMAP.md`');
    expect(body).toMatchSnapshot();
  });

  it('degrades gracefully when no laws were recorded', () => {
    expect(buildAdapterBody({ ...CTX, aiLaws: [] })).toContain('_No laws were recorded._');
  });
});

describe('writeAdapter', () => {
  it('writes a sentinel-wrapped file for every target', () => {
    const targets: AgentTarget[] = [
      'claude-code',
      'codex',
      'cursor',
      'copilot',
      'gemini-cli',
      'undecided',
    ];
    for (const target of targets) {
      const io = memoryAdapterIO();
      const { path, body } = writeAdapter(io, target, CTX);
      expect(path).toBe(adapterPathFor(target));
      expect(body).toContain(BEGIN);
      expect(body).toContain(END);
      expect(io.files.get(path)).toBe(body);
    }
  });

  it('preserves hand-written content and is a zero diff on a second run', () => {
    const io = memoryAdapterIO({
      'CLAUDE.md': '# My own header\n\nKeep this.\n',
    });
    const first = writeAdapter(io, 'claude-code', CTX).body;
    expect(first).toContain('# My own header');

    const second = writeAdapter(io, 'claude-code', CTX).body;
    expect(second).toBe(first);
  });
});
