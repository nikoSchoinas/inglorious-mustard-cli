import { SessionError, loadSession } from '../engine/session.js';
import { PHASES } from '../questions/index.js';
import type { MustardSession, PhaseState } from '../schemas/session.js';
import { pc } from '../ui/color.js';

/**
 * `mustard status` / `sitrep` (spec §9.6) — phase progress and tasks done/total.
 * `formatStatus` is pure and colour-free so it snapshot-tests deterministically;
 * `runStatus` loads the session and prints it.
 */

const PHASE_NAMES: Record<number, string> = Object.fromEntries(
  PHASES.map((p) => [p.phase, p.name]),
);

const STATUS_LABEL: Record<PhaseState['status'], string> = {
  pending: 'pending',
  in_progress: 'in progress',
  awaiting_review: 'awaiting review',
  accepted: 'done',
};

export function formatStatus(session: MustardSession): string {
  const name = session.projectName.trim() || '(unnamed)';
  const lines: string[] = [
    `Mission: ${name}`,
    `Literacy: ${session.literacy}   Agent: ${session.agentTarget}`,
    '',
    'Phases:',
  ];

  const phases = [...session.phases].sort((a, b) => a.id - b.id);
  if (phases.length === 0) {
    lines.push('  (none started)');
  }
  for (const ps of phases) {
    const phaseName = PHASE_NAMES[ps.id] ?? `Phase ${ps.id}`;
    const answers = ps.answers.length;
    const artifacts = ps.artifactPaths.length;
    const detail = artifacts > 0 ? `, ${artifacts} artifact${artifacts === 1 ? '' : 's'}` : '';
    lines.push(
      `  ${ps.id}. ${phaseName} — ${STATUS_LABEL[ps.status]} (${answers} answer${answers === 1 ? '' : 's'}${detail})`,
    );
  }

  const done = session.tasks.filter((t) => t.status === 'done').length;
  lines.push('', `Tasks: ${done}/${session.tasks.length} done`);

  return lines.join('\n');
}

export interface StatusDeps {
  cwd?: string;
  load?: (cwd?: string) => MustardSession;
  print?: (message: string) => void;
  exit?: (code: number) => never;
}

export async function runStatus(deps: StatusDeps = {}): Promise<void> {
  const load = deps.load ?? loadSession;
  const print = deps.print ?? ((m: string) => console.log(m));
  const exit = deps.exit ?? ((code: number) => process.exit(code) as never);

  let session: MustardSession;
  try {
    session = load(deps.cwd);
  } catch (err) {
    if (err instanceof SessionError && err.code === 'not-found') {
      print(pc.yellow('No mission here yet. Run `mustard init` to start one.'));
      return exit(1);
    }
    throw err;
  }

  print(formatStatus(session));
}
