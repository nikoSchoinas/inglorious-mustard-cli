import { readFileSync } from 'node:fs';

/**
 * The package version, read at runtime from `package.json`. Resolving relative to
 * `import.meta.url` works both from `src/` under tsx and from `dist/` after `tsc`,
 * and avoids JSON import-attribute friction across Node/bundler targets. Shared by
 * the CLI `--version` flag and the artifact frontmatter (`mustard_version`, §9.7)
 * so the two can never drift.
 */
export function readVersion(): string {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version: string };
  return pkg.version;
}
