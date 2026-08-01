import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { PRODUCT_NAME, SLOGAN } from './branding.js';

/**
 * Read the package version at runtime. Resolving relative to `import.meta.url`
 * works both from `src/` under tsx and from `dist/` after `tsc`, and avoids
 * JSON import-attribute friction across Node/bundler targets.
 */
function readVersion(): string {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version: string };
  return pkg.version;
}

/** Every subcommand is a stub in M0 — real behaviour arrives in later milestones. */
function notYetImplemented(name: string): void {
  console.log(`\`mustard ${name}\` is not yet implemented.`);
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

  // Global flags (declared now; wired to behaviour in later milestones).
  program
    .option('--no-color', 'disable coloured output')
    .option('--json', 'machine-readable output')
    .option('--dry-run', 'run the interrogation, write nothing');

  program
    .command('init')
    .description('Start a mission: create mustard/ and run Phase 0.')
    .action(() => notYetImplemented('init'));

  program
    .command('resume')
    .description('Continue from the exact question where the session stopped.')
    .action(() => notYetImplemented('resume'));

  program
    .command('status')
    .alias('sitrep')
    .description('Phase progress, tasks done/total.')
    .action(() => notYetImplemented('status'));

  program
    .command('phase')
    .argument('<n>', 'phase number')
    .option('--redo', 're-run the phase, warning about stale downstream artifacts')
    .description('Re-run a phase.')
    .action(() => notYetImplemented('phase'));

  program
    .command('prompts')
    .description('List prompts and print the selected unblocked prompt card.')
    .action(() => notYetImplemented('prompts'));

  program
    .command('export')
    .option('--format <format>', 'speckit | openspec | agents')
    .description('Convert the bundle to another SDD tool layout.')
    .action(() => notYetImplemented('export'));

  program
    .command('config')
    .description('Provider, keys, models.')
    .action(() => notYetImplemented('config'));

  return program;
}
