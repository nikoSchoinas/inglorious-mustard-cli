#!/usr/bin/env bash
#
# M16 binary spike (technical-plan §5, spec §9.1) — SPIKE ONLY, not a release pipeline.
#
# Validates two things about a compiled single-file binary:
#   1. `bun build --compile` yields a working `mustard` binary that embeds its runtime,
#      and `--version` / `--help` still resolve (the version is read from package.json via
#      import.meta.url — a classic thing compilation breaks).
#   2. The optional `@napi-rs/keyring` native dep degrades cleanly to config-file storage
#      when its prebuilt `.node` isn't embedded in the binary — `mustard config show` must
#      resolve a key source without throwing.
#
# Manual: bun is not a project dependency. This is a REPORT, not a gate — each check is
# non-fatal so the spike surfaces every finding in one run. Findings go in docs/binary-spike.md.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
BIN="$ROOT/mustard-bin"

if ! command -v bun >/dev/null 2>&1; then
  echo "[spike] bun not installed — skipping. Install from https://bun.sh to run this spike."
  exit 0
fi

check() {
  local label="$1"; shift
  if "$@" >/tmp/spike-out 2>&1; then
    echo "[spike] PASS  $label"
  else
    echo "[spike] FAIL  $label"
    sed 's/^/[spike]       /' /tmp/spike-out | tail -n 6
  fi
}

echo "[spike] bun $(bun --version)"
echo "[spike] compiling a single-file binary…"
bun build --compile --outfile "$BIN" src/index.ts
echo "[spike] binary size: $(du -h "$BIN" | cut -f1)"

check "./mustard-bin --version" "$BIN" --version
check "./mustard-bin --help" "$BIN" --help

# Run in an isolated HOME so the spike never reads or writes the developer's real config.
SPIKE_HOME=$(mktemp -d)
check "./mustard-bin config show (keyring degradation)" env HOME="$SPIKE_HOME" "$BIN" config show
rm -rf "$SPIKE_HOME"

echo "[spike] done. Record results in docs/binary-spike.md."
