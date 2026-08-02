import type { MustardSession } from '../../schemas/session.js';
import type { AdapterIO } from './io.js';
import { mergeSentinel } from './sentinel.js';

/**
 * The agent adapter files (spec §3.2, §8.10). After the bundle is written, MUSTARD
 * writes one instruction file at the repo root for the agent chosen in Phase 0, so
 * that agent reads the plan without being told to. Every target shares the same
 * body (a pointer into `mustard/` plus the machine-directed AI-LAWS); only the
 * path differs. `antigravity` / `other` / `undecided` fall back to `AGENTS.md`, the
 * open standard.
 *
 * Writing goes through `mergeSentinel`, so regenerating never clobbers a
 * hand-written CLAUDE.md / AGENTS.md and running twice is a zero diff (§9.7).
 */

type AgentTarget = MustardSession['agentTarget'];

/** Repo-root path for each agent target. */
const ADAPTER_PATHS: Record<AgentTarget, string> = {
  'claude-code': 'CLAUDE.md',
  codex: 'AGENTS.md',
  cursor: '.cursor/rules/mustard.mdc',
  copilot: '.github/copilot-instructions.md',
  'gemini-cli': 'GEMINI.md',
  // Fallbacks — the open AGENTS.md standard (§3.2).
  antigravity: 'AGENTS.md',
  other: 'AGENTS.md',
  undecided: 'AGENTS.md',
};

/** The inputs the shared adapter body is rendered from. */
export interface AdapterContext {
  projectName: string;
  mission: string;
  /** The Phase 1 machine-directed AI-LAWS, inlined so the agent has them without a second file. */
  aiLaws: readonly string[];
}

/** The repo-root path MUSTARD writes for a given agent target. */
export function adapterPathFor(target: AgentTarget): string {
  return ADAPTER_PATHS[target];
}

/**
 * The shared adapter body — the content that lives BETWEEN the sentinels. Points
 * the agent at the `mustard/` bundle and inlines the AI-LAWS. Deterministic.
 */
export function buildAdapterBody(ctx: AdapterContext): string {
  const lines: string[] = [
    `# ${ctx.projectName} — AI agent guide`,
    '',
    'This project was planned with MUSTARD. The full plan lives in `mustard/`; read it before writing code.',
    '',
    '## Mission',
    ctx.mission,
    '',
    '## Laws (non-negotiable)',
  ];
  if (ctx.aiLaws.length === 0) {
    lines.push('_No laws were recorded._');
  } else {
    for (const law of ctx.aiLaws) {
      lines.push(`- ${law}`);
    }
  }
  lines.push(
    '',
    '## Where to look',
    '- `mustard/00-BRIEFING.md` — one-page summary; start here',
    '- `mustard/02-USE-CASES.md` — what to build, and how each flow fails',
    '- `mustard/03-SCHEMAS.md` — the data model',
    '- `mustard/04-STACK.md` — the chosen stack and why',
    '- `mustard/05-ARCHITECTURE.md` — components and the riskiest flows',
    '- `mustard/06-ROADMAP.md` — the task sequence',
    '- `mustard/07-PROMPTS/` — a ready-to-paste prompt per task',
    '',
    'Build tasks in roadmap order. Run `mustard prompts` for the next unblocked task.',
  );
  return lines.join('\n');
}

/**
 * Render and write the adapter file for `target`, merging into any existing file
 * via the sentinels. Returns the path written and the final contents (for tests
 * and the closing summary). Reading + writing goes through the injected `io`.
 */
export function writeAdapter(
  io: AdapterIO,
  target: AgentTarget,
  ctx: AdapterContext,
): { path: string; body: string } {
  const path = adapterPathFor(target);
  const merged = mergeSentinel(io.read(path), buildAdapterBody(ctx));
  io.write(path, merged);
  return { path, body: merged };
}
