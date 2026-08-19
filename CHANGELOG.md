# inglorious-mustard

## 0.1.0

First public release. Shippable `npx inglorious-mustard`: a seven-phase, question-driven planning
method that extracts a spec and emits a complete `mustard/` planning bundle plus ready-to-paste
prompt cards. Bring-your-own-key across Anthropic, OpenAI, Google, and Ollama (local).

Release tooling: changesets-based versioning with a `prepack` build hook and publish metadata. A
clean-room smoke test packs the tarball and drives the full seven-phase habit-tracker mission from
a fresh install (locally and in a bare `node:20` image), wired into CI. A `bun build --compile`
binary spike documented that compiled-binary distribution is deferred (runtime `package.json`
resolution blocker) — v0.1 ships via npm only.
