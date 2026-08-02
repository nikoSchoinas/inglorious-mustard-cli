import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The read+write seam for adapter files. Unlike the `mustard/` artifacts (write
 * only), adapters live at the repo ROOT and must be READ before writing so the
 * sentinel merge can preserve hand-written sections (§9.7). Injectable so tests run
 * against memory instead of the filesystem.
 */
export interface AdapterIO {
  /** The current contents of `path`, or `undefined` if it does not exist. */
  read(path: string): string | undefined;
  /** Write `body` to `path`, creating parent directories as needed. */
  write(path: string, body: string): void;
}

/** Real filesystem IO rooted at `cwd` (default `process.cwd()`); mkdir-p's nested paths. */
export function fileAdapterIO(cwd: string = process.cwd()): AdapterIO {
  return {
    read(path) {
      const full = join(cwd, path);
      return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
    },
    write(path, body) {
      const full = join(cwd, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body, 'utf8');
    },
  };
}

/** In-memory IO for tests. `files` is the backing store, readable after a run. */
export function memoryAdapterIO(seed: Record<string, string> = {}): AdapterIO & {
  files: Map<string, string>;
} {
  const files = new Map<string, string>(Object.entries(seed));
  return {
    files,
    read(path) {
      return files.get(path);
    },
    write(path, body) {
      files.set(path, body);
    },
  };
}
