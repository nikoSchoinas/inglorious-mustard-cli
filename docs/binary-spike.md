# Binary distribution spike (`bun build --compile`)

**Milestone:** M16 (technical-plan §5) · **Status:** spike only — no binaries or `curl | sh`
installer ship in v0.1. This records whether the compiled-binary path in spec §9.1 is viable and
what it would take to pick it up later.

Run it yourself: `bash scripts/binary-spike.sh` (requires [bun](https://bun.sh); not a project
dependency).

## Result: **NO-GO for v0.1 as-is** — one fixable blocker

| Check | Result |
|---|---|
| `bun build --compile` produces a binary | ✅ yes — `bun 1.3.11`, 260 modules, ~130ms |
| Binary size | ⚠️ ~61 MB (embeds the Bun runtime) |
| `./mustard-bin --version` | ❌ **fails** — `ENOENT: /$bunfs/package.json` |
| `./mustard-bin --help` | ❌ fails (same root cause) |
| `config show` / keyring degradation | ❌ not reachable (same root cause) |

## The blocker: runtime `package.json` resolution

`src/version.ts` reads the version at runtime:

```ts
const pkgUrl = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8'));
```

This is correct for the **npm/`npx` distribution** — npm always ships `package.json`, so from
`dist/version.js` the `../package.json` URL resolves and `mustard --version` prints `0.1.0`
(verified by the M16 smoke test). Under `bun build --compile`, though, the bundled code lives in a
virtual filesystem (`/$bunfs/…`) and **only the bundled JS is embedded** — `package.json` is not.
The URL resolves to `/$bunfs/package.json`, which doesn't exist, so `readFileSync` throws `ENOENT`.

Because `readVersion()` is called while *constructing* the commander program (for `.version()`),
the throw happens before any command runs — so **every** invocation fails, not just `--version`.
That's why the keyring-degradation check never executes: the program can't be built.

## What a future binary-release milestone must do

1. **Make version resolution compilation-safe.** Options, cheapest first:
   - Import the JSON so the bundler embeds it: `import pkg from '../package.json' with { type: 'json' }`
     (bun inlines JSON imports into the binary). Needs `resolveJsonModule` in `tsconfig` and a
     check that the npm/tsc path stays happy — `src/version.ts:1` deliberately avoided JSON
     import-attribute friction, so validate across Node + bun before adopting.
   - Or inject the version at build time as a constant (e.g. a `define`/`--define` or a generated
     `version.generated.ts`), keeping the filesystem read for the `dist/` path only.
2. **Re-validate keyring degradation** once the binary boots: `@napi-rs/keyring`'s prebuilt
   `.node` is a native addon that won't be embedded by `--compile`, so confirm `src/config/keyring.ts`
   returns `null` and the CLI falls back to `~/.mustard/config.json` (mode 0600) — the code already
   guards the dynamic import, but it must be proven end-to-end in a compiled binary.
3. **Weigh the ~61 MB size** against the npm path before committing to a `curl | sh` installer.

## Recommendation

Ship v0.1 via `npx inglorious-mustard` only (the working, verified path). Defer compiled binaries
to a dedicated milestone; the blocker above is small and well-understood, but it is real and out of
M16's scope.
