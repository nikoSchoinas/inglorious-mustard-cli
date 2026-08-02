import {
  PHASE_ARTIFACTS,
  downstreamArtifacts,
  downstreamPhases,
  resetPhase,
} from '../engine/artifact-graph.js';
import { MissionHaltError } from '../engine/errors.js';
import { SessionError, loadSession, saveSession } from '../engine/session.js';
import type { MustardSession } from '../schemas/session.js';
import { showBanner } from '../ui/banner.js';
import { handleCancellation, installCancelHandler } from '../ui/cancel.js';
import { ClackPrompter } from '../ui/clack-prompter.js';
import { pc } from '../ui/color.js';
import { type CommandDeps, type MissionDeps, driveMission } from './drive.js';

/**
 * `mustard phase <n> --redo` (spec §9.6) — re-run a phase. Because a later phase
 * derives from an earlier one, re-running phase `n` makes every downstream artifact
 * stale. This command surfaces that impact in plain language and offers to cascade
 * the regeneration: re-run phase `n` alone, or reset phases `n..7` so the mission
 * driver rebuilds the whole chain. Resetting a phase and re-driving reuses the exact
 * same idempotent mission driver as `init`/`resume`, so accepted phases are skipped
 * and reset ones re-run.
 *
 * Without `--redo`, the command is a read-only preview of what a redo would touch.
 */

export interface PhaseCommandDeps extends CommandDeps {
  /** Actually re-run (vs. preview the impact). Set by the `--redo` flag. */
  redo?: boolean;
  load?: (cwd?: string) => MustardSession;
  /** The mission driver. Injected for tests; defaults to the real one. */
  drive?: (session: MustardSession, deps: MissionDeps) => Promise<MustardSession>;
}

const LAST_PHASE = 7;

export async function runPhaseCommand(n: number, deps: PhaseCommandDeps = {}): Promise<void> {
  const prompter = deps.prompter ?? new ClackPrompter();
  const now = deps.now ?? (() => new Date().toISOString());
  const print = deps.print ?? ((m: string) => console.log(m));
  const exit = deps.exit ?? ((code: number) => process.exit(code) as never);
  const load = deps.load ?? loadSession;
  const drive = deps.drive ?? driveMission;

  if (!Number.isInteger(n) || n < 0 || n > LAST_PHASE) {
    print(pc.red(`Phase must be a whole number between 0 and ${LAST_PHASE}.`));
    return exit(1);
  }

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

  const stale = downstreamArtifacts(n);

  // Read-only preview: no `--redo`, so change nothing.
  if (!deps.redo) {
    const lines = [
      `Re-running Phase ${n} regenerates ${ownArtifacts(n)}.`,
      stale.length > 0
        ? `It would also make these downstream artifacts stale:\n${bullets(stale)}`
        : 'Nothing downstream depends on it.',
      '',
      `Run \`mustard phase ${n} --redo\` to proceed.`,
    ];
    print(lines.join('\n'));
    return;
  }

  // --redo: warn about the downstream impact, then offer the cascade.
  if (stale.length > 0) {
    prompter.note(
      `Re-running Phase ${n} makes these downstream artifacts stale:\n${bullets(stale)}`,
      'Downstream impact',
    );
  }
  const cascade =
    stale.length > 0
      ? await prompter.confirm({
          message: `Also regenerate the downstream artifacts? (No re-runs Phase ${n} only.)`,
          initialValue: false,
        })
      : false;

  const toReset = cascade ? [n, ...downstreamPhases(n)] : [n];
  const save = deps.save ?? ((s: MustardSession) => saveSession(s, deps.cwd));
  let next = session;
  for (const id of toReset) {
    next = resetPhase(next, id);
  }
  next.currentPhase = n;
  next = save(next);

  showBanner(prompter);
  const mission: MissionDeps = { ...deps, prompter, now, save, print, exit };
  const dispose = deps.installCancel === false ? undefined : installCancelHandler({ print, exit });
  try {
    await drive(next, mission);
    prompter.note(
      cascade
        ? `Phase ${n} and its downstream phases were regenerated.`
        : `Phase ${n} was regenerated.`,
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

/** The artifacts a phase owns, for the preview line — or a fallback for question-only phases. */
function ownArtifacts(n: number): string {
  const own = PHASE_ARTIFACTS[n] ?? [];
  return own.length > 0 ? own.join(', ') : `Phase ${n} (no artifacts)`;
}

function bullets(items: readonly string[]): string {
  return items.map((i) => `  - ${i}`).join('\n');
}
