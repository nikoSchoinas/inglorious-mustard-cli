import { MissionHaltError } from '../engine/errors.js';
import { SessionError, loadSession, saveSession } from '../engine/session.js';
import type { MustardSession } from '../schemas/session.js';
import { showBanner } from '../ui/banner.js';
import { handleCancellation, installCancelHandler } from '../ui/cancel.js';
import { ClackPrompter } from '../ui/clack-prompter.js';
import { pc } from '../ui/color.js';
import { type CommandDeps, type MissionDeps, driveMission } from './drive.js';

/**
 * `mustard resume` (spec §9.6) — continue from the exact question where the session
 * stopped. Runs the same mission driver as `init`; because every step re-derives
 * its position from the persisted `PhaseState` (answer-level resume), accepted
 * phases are skipped and the interrupted phase picks up at the next question.
 */
export async function runResume(deps: CommandDeps = {}): Promise<void> {
  const prompter = deps.prompter ?? new ClackPrompter();
  const now = deps.now ?? (() => new Date().toISOString());
  const print = deps.print ?? ((m: string) => console.log(m));
  const exit = deps.exit ?? ((code: number) => process.exit(code) as never);

  let session: MustardSession;
  try {
    session = loadSession(deps.cwd);
  } catch (err) {
    if (err instanceof SessionError && err.code === 'not-found') {
      print(pc.yellow('No mission here yet. Run `mustard init` to start one.'));
      return exit(1);
    }
    throw err;
  }

  showBanner(prompter);

  const save = deps.save ?? ((s: MustardSession) => saveSession(s, deps.cwd));
  const mission: MissionDeps = { ...deps, prompter, now, save, print, exit };
  const dispose = deps.installCancel === false ? undefined : installCancelHandler({ print, exit });
  try {
    await driveMission(session, mission);
    prompter.note(`Mission bundle up to date in ${pc.cyan('mustard/')}.`, 'Done');
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
