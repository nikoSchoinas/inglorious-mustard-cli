#!/usr/bin/env bash
#
# M16 release-hardening smoke test (technical-plan §5).
#
# Proves the *published* tarball is shippable: it packs the package, installs the tarball
# into a clean location, checks the bin resolves (`mustard --version` / `--help`), and drives
# the full seven-phase habit-tracker mission from the installed engine — offline, zero tokens.
#
# Two layers:
#   1. Local clean-install: install the tarball into a throwaway dir and run the driver.
#      Runs everywhere, no Docker needed — fast feedback.
#   2. Docker clean-room: the milestone's literal acceptance — a bare node:20 image with
#      nothing but npm/npx installs the tarball and runs the same mission. Skipped when
#      Docker is unavailable or SKIP_DOCKER=1.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SMOKE="$ROOT/tests/smoke"
cd "$ROOT"

echo "[smoke] building + serializing the habit-tracker mission…"
pnpm build
pnpm exec tsx tests/smoke/serialize-mission.ts

echo "[smoke] packing the tarball…"
rm -f "$SMOKE"/*.tgz "$SMOKE"/inglorious-mustard.tgz
TGZ_NAME=$(npm pack --pack-destination "$SMOKE" | tail -n1)
TARBALL="$SMOKE/$TGZ_NAME"
echo "[smoke] packed $TARBALL"

echo "[smoke] layer 1 — local clean install…"
TMP=$(mktemp -d)
cleanup() { rm -rf "$TMP"; rm -f "$SMOKE/inglorious-mustard.tgz"; }
trap cleanup EXIT
(
  cd "$TMP"
  npm init -y >/dev/null 2>&1
  npm install "$TARBALL" >/dev/null 2>&1
  echo -n "[smoke]   mustard --version -> "
  npx mustard --version
  npx mustard --help >/dev/null
  cp "$SMOKE/smoke-driver.mjs" "$SMOKE/habit-tracker.mission.json" .
  node smoke-driver.mjs
)

if [ "${SKIP_DOCKER:-}" = "1" ]; then
  echo "[smoke] SKIP_DOCKER=1 — skipping the Docker clean-room layer."
  echo "[smoke] PASS (local layer only)."
  exit 0
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "[smoke] docker not found — skipping the Docker clean-room layer."
  echo "[smoke] PASS (local layer only)."
  exit 0
fi

echo "[smoke] layer 2 — Docker clean-room (node:20-slim, npx-only)…"
cp "$TARBALL" "$SMOKE/inglorious-mustard.tgz"
docker build -q -t mustard-smoke "$SMOKE" >/dev/null
docker run --rm mustard-smoke

echo "[smoke] PASS."
