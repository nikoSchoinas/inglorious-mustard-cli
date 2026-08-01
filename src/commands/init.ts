import { MissionHaltError } from '../engine/errors.js';
import { saveSession, sessionExists } from '../engine/session.js';
import type { MustardSession } from '../schemas/session.js';
import { showBanner } from '../ui/banner.js';
import { handleCancellation, installCancelHandler } from '../ui/cancel.js';
import { ClackPrompter } from '../ui/clack-prompter.js';
import { pc } from '../ui/color.js';
import { type CommandDeps, type MissionDeps, driveMission } from './drive.js';

/**
 * `mustard init` (spec §9.6) — start a mission. Refuses if a session already
 * exists (suggests `resume`), then drives Phase 0 → 0.5 setup → Phase 1 via the
 * shared mission driver. The fresh session is persisted before the first question,
 * so a Ctrl-C at any point loses nothing (§7.3.1); a cancel takes the clean
 * "answers on disk, run `mustard resume`, exit 0" path (§9.8).
 */
export async function runInit(deps: CommandDeps = {}): Promise<void> {
  const prompter = deps.prompter ?? new ClackPrompter();
  const now = deps.now ?? (() => new Date().toISOString());
  const print = deps.print ?? ((m: string) => console.log(m));
  const exit = deps.exit ?? ((code: number) => process.exit(code) as never);

  if (sessionExists(deps.cwd)) {
    print(
      pc.yellow(
        'A mission already exists here. Run `mustard resume` to continue it, or `mustard status` to see progress.',
      ),
    );
    return exit(1);
  }

  showBanner(prompter);

  const save = deps.save ?? ((s: MustardSession) => saveSession(s, deps.cwd));
  // Persist the fresh session up front: creates `mustard/` and guarantees resume.
  const session = save(freshSession(now));

  const mission: MissionDeps = { ...deps, prompter, now, save, print, exit };
  const dispose = deps.installCancel === false ? undefined : installCancelHandler({ print, exit });
  try {
    await driveMission(session, mission);
    prompter.note(
      `Mission bundle written to ${pc.cyan('mustard/')}. Run \`mustard status\` to review it.`,
      'Done',
    );
  } catch (err) {
    if (err instanceof MissionHaltError) {
      print(pc.yellow(err.message));
      return exit(1);
    }
    return handleCancellation(err, { print, exit });
  } finally {
    dispose?.();
  }
}

/** A minimal valid session at the very start of Phase 0. */
function freshSession(now: () => string): MustardSession {
  const ts = now();
  return {
    schemaVersion: 1,
    projectName: '',
    literacy: 'none',
    agentTarget: 'undecided',
    currentPhase: 0,
    phases: [],
    facts: {},
    factSources: {},
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}
