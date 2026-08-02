# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets). Each
unreleased change adds a small markdown file here describing the bump (`patch` / `minor` /
`major`) and a human summary; they are consumed and deleted when a version is cut.

Releases are **manual** for v0.1 (see `docs/releasing.md`):

```
pnpm changeset          # write a changeset for your change
pnpm version-packages   # apply pending changesets: bump version + update CHANGELOG.md
pnpm release            # build + publish the new version to npm
```
