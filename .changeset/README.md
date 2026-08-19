# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets). Each
unreleased change adds a small markdown file here describing the bump (`patch` / `minor` /
`major`) and a human summary; they are consumed and deleted when a version is cut.

Releases are **automated** by `.github/workflows/release.yml` (see `dev/releasing.md`): add a
changeset here in your PR, and merging the bot's "Version Packages" PR publishes to npm. You
don't run `pnpm release` by hand.
