# Releasing

Releases are **manual** for v0.1, driven by [changesets](https://github.com/changesets/changesets).
There is no CI publish job and no `NPM_TOKEN` in the repo — a human cuts each release.

## One-time setup

You need publish rights to the `inglorious-mustard` npm package and to be logged in:

```
npm whoami        # confirm you're logged in
npm login         # if not
```

## Cutting a release

1. **Write a changeset** for each meaningful change (usually as part of the PR):

   ```
   pnpm changeset
   ```

   Pick the bump (`patch` / `minor` / `major`) and write a one-line human summary. This drops a
   markdown file under `.changeset/`; commit it with your change.

2. **Apply pending changesets** — bumps the version in `package.json` and updates
   `CHANGELOG.md`, then deletes the consumed changeset files:

   ```
   pnpm version-packages
   ```

   Review the diff (version + changelog) and commit it, e.g. `Release vX.Y.Z`.

3. **Publish** — builds `dist/` and pushes the new version to npm:

   ```
   pnpm release
   ```

   `pnpm release` runs `pnpm build && changeset publish`. Independently, `npm publish` /
   `npm pack` also run `prepack` (`pnpm build`), so the tarball always contains a fresh `dist/`
   even though `dist/` is gitignored.

4. **Tag and push**:

   ```
   git push --follow-tags
   ```

## What ships

The published tarball contains only what the `files` whitelist in `package.json` allows —
`dist/**` plus the always-included `package.json`, `README.md`, and `LICENSE`. Source, tests,
and fixtures are **not** published. Verify before releasing:

```
npm pack --dry-run
```

## Pre-flight checklist

```
pnpm typecheck && pnpm lint && pnpm test   # gates
pnpm smoke                                 # full mission from a clean install of the tarball
```

`pnpm smoke` packs the tarball, installs it into a throwaway location, checks
`mustard --version` / `--help`, and drives the full habit-tracker mission offline. With Docker
running it also repeats the run in a bare `node:20-slim` image (the clean-room acceptance).
