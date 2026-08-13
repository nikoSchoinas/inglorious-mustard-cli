import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SessionError, loadSession, mustardDir } from '../engine/session.js';
import { promptCardFilename } from '../render/markdown/prompt-card.js';
import { PromptsJson } from '../schemas/cli-json.js';
import type { MustardSession } from '../schemas/session.js';
import { ClackPrompter } from '../ui/clack-prompter.js';
import { copyToClipboard } from '../ui/clipboard.js';
import { pc } from '../ui/color.js';
import type { Prompter } from '../ui/prompter.js';

/**
 * `mustard prompts` (spec §3.3, §9.6) — the return loop that turns a one-shot
 * generator into a daily tool. Lists the roadmap tasks that are ready to build (all
 * their dependencies done), lets the user pick one, prints its prompt card, and
 * offers to copy it to the clipboard. `--json` emits every task with a `blocked`
 * flag for the future plugin/MCP surface (§11 v0.4) and is non-interactive.
 *
 * The printed card is the already-written `07-PROMPTS/` artifact read from disk — the
 * canonical, user-reviewed file — not a re-render, so what the user pastes is exactly
 * what the bundle contains.
 */

export interface PromptsDeps {
  cwd?: string;
  /** Emit machine-readable JSON instead of the interactive picker. */
  json?: boolean;
  load?: (cwd?: string) => MustardSession;
  print?: (message: string) => void;
  exit?: (code: number) => never;
  prompter?: Prompter;
  /** Copy to clipboard. Injected for tests; defaults to the OS-native tool. */
  copy?: (text: string) => Promise<boolean>;
  /** Read a prompt-card file. Injected for tests; defaults to reading `mustard/<name>`. */
  readCard?: (cwd: string | undefined, filename: string) => string | undefined;
}

function defaultReadCard(cwd: string | undefined, filename: string): string | undefined {
  try {
    return readFileSync(join(mustardDir(cwd), filename), 'utf8');
  } catch {
    return undefined;
  }
}

export async function runPrompts(deps: PromptsDeps = {}): Promise<void> {
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

  // --json: the whole task list, each flagged blocked/ready. Non-interactive.
  if (deps.json) {
    const payload = PromptsJson.parse({
      tasks: session.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        group: t.group,
        status: t.status,
        dependsOn: t.dependsOn,
        // Dependency-readiness only — independent of this task's own status.
        blocked: t.dependsOn.some(
          (depId) => session.tasks.find((x) => x.id === depId)?.status !== 'done',
        ),
        acceptanceCriteria: t.acceptanceCriteria,
        filesTouched: t.filesTouched,
      })),
    });
    print(JSON.stringify(payload, null, 2));
    return;
  }

  const prompter = deps.prompter ?? new ClackPrompter();

  if (session.tasks.length === 0) {
    prompter.note(
      'No roadmap yet. Run `mustard resume` to finish the mission and generate the prompt pack.',
      'Nothing to build',
    );
    return;
  }

  // Every task is offered, in roadmap order — the picker no longer gates on
  // dependency readiness, so any prompt card can be pulled up at any time. The
  // `dependsOn` order still reflects the recommended build sequence.
  const choice = await prompter.select({
    message: 'Which task do you want to build next?',
    options: session.tasks.map((t) => ({
      value: t.id,
      label: `${t.id} — ${t.title}${t.status === 'done' ? ' (done)' : ''}`,
    })),
  });
  const task = session.tasks.find((t) => t.id === choice);
  // `select` only ever returns one of the offered values; guard for exhaustiveness.
  if (!task) {
    return;
  }

  const filename = promptCardFilename(task);
  const body = (deps.readCard ?? defaultReadCard)(deps.cwd, filename);
  if (body === undefined) {
    prompter.note(
      `Prompt card ${filename} is missing. Run \`mustard resume\` to regenerate the prompt pack.`,
      'Missing card',
    );
    return;
  }

  print(body);

  const copy = deps.copy ?? copyToClipboard;
  const copied = await copy(body);
  prompter.note(
    copied
      ? 'Copied to your clipboard — paste it into your agent and build.'
      : 'Clipboard unavailable — copy the card above and paste it into your agent.',
    copied ? 'Copied' : 'Copy manually',
  );
}
