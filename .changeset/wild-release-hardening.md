---
"inglorious-mustard": minor
---

Release hardening (M16): shippable `npx inglorious-mustard`. Adds changesets-based release
tooling with a `prepack` build hook, publish metadata, and a full README + release runbook. A
clean-room smoke test packs the tarball and drives the full seven-phase habit-tracker mission
from a fresh install (locally and in a bare `node:20` image), wired into CI. A `bun build --compile`
binary spike documents that compiled-binary distribution is deferred (runtime `package.json`
resolution blocker) — v0.1 ships via npm only.
