import { Command } from 'commander';
import { PRODUCT_NAME, SLOGAN } from './branding.js';
import { buildConfigCommand } from './commands/config.js';
import { runInit } from './commands/init.js';
import { runPhaseCommand } from './commands/phase.js';
import { runPrompts } from './commands/prompts.js';
import { runResume } from './commands/resume.js';
import { runStatus } from './commands/status.js';
import { configureColor } from './ui/color.js';
import { readVersion } from './version.js';

/** Subcommands still awaiting their milestone print a placeholder. */
function notYetImplemented(name: string): void {
  console.log(`\`mustard ${name}\` is not yet implemented.`);
}

/** The global flags (`--json` / `--dry-run`) as read from the program's options. */
interface GlobalFlags {
  json?: boolean;
  dryRun?: boolean;
}

/**
 * Build the commander program. Kept separate from the entry point (`index.ts`)
 * so command wiring can be unit-tested without spawning a process or a TTY.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('mustard')
    .description(`${PRODUCT_NAME} — ${SLOGAN}`)
    .version(readVersion(), '-v, --version', 'output the current version');

  // Global flags. `--json` / `--dry-run` are wired to behaviour in M14; `--no-color`
  // is honoured now via `configureColor` in the preAction hook below.
  program
    .option('--no-color', 'disable coloured output')
    .option('--json', 'machine-readable output')
    .option('--dry-run', 'run the interrogation, write nothing');

  // Commander sets `color: false` when `--no-color` is passed. Apply it before any
  // command action runs, so every `pc.*` call downstream respects the choice.
  program.hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts<{ color?: boolean }>();
    configureColor(opts.color === false);
  });

  // Read the program-level global flags once. Commander stores them on the root
  // program regardless of which subcommand ran.
  const globals = (): GlobalFlags => program.opts<GlobalFlags>();

  program
    .command('init')
    .description('Start a mission: create mustard/ and run Phase 0.')
    .action(async () => {
      await runInit({ dryRun: globals().dryRun });
    });

  program
    .command('resume')
    .description('Continue from the exact question where the session stopped.')
    .action(async () => {
      await runResume({ dryRun: globals().dryRun });
    });

  program
    .command('status')
    .alias('sitrep')
    .description('Phase progress, tasks done/total.')
    .action(async () => {
      await runStatus({ json: globals().json });
    });

  program
    .command('phase')
    .argument('<n>', 'phase number')
    .option('--redo', 're-run the phase, warning about stale downstream artifacts')
    .description('Re-run a phase.')
    .action(async (n: string, opts: { redo?: boolean }) => {
      await runPhaseCommand(Number.parseInt(n, 10), {
        redo: opts.redo,
        dryRun: globals().dryRun,
      });
    });

  program
    .command('prompts')
    .description('List prompts and print the selected unblocked prompt card.')
    .action(async () => {
      await runPrompts({ json: globals().json });
    });

  program
    .command('export')
    .option('--format <format>', 'speckit | openspec | agents')
    .description('Convert the bundle to another SDD tool layout.')
    .action(() => notYetImplemented('export'));

  program.addCommand(buildConfigCommand());

  return program;
}
