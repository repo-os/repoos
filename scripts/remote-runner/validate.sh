#!/usr/bin/env bash
#
# Runs on the Hetzner runner VM. Invoked by RepoOS over ssh as:
#
#   /opt/repoos/validate.sh <bundle-path> <expected-sha> [artifacts-dir]
#
# Restores the candidate tree from a git bundle, hard-verifies it is exactly the
# SHA RepoOS asked for, then runs `bun install && bun run build && bun run test`
# inside the prebuilt `repoos-ci` container with a persistent bun cache.
#
# Exit codes: 0 = green. 3 = SHA mismatch (never a test failure — a transport
# bug). Anything else = the gate's own non-zero exit (build or test failed).
set -euo pipefail

BUNDLE="${1:?usage: validate.sh <bundle-path> <expected-sha>}"
SHA="${2:?usage: validate.sh <bundle-path> <expected-sha>}"
# Per-run artifacts dir (#0520): RepoOS passes a unique one so overlapping runs
# never wipe each other's logs. Without it, fall back to the shared default.
# Under $HOME, not /tmp or /var/tmp: on Linux, /tmp is commonly a RAM-backed
# tmpfs with a per-user quota shared with whatever else that user runs on the
# box, so this runner's own churn there can hit "disk quota exceeded" for
# reasons unrelated to the run. /var/tmp dodges that but breaks on a macOS
# host running Docker Desktop: its bind-mount file sharing does not include
# /tmp or /var/tmp by default, only paths under $HOME — mounting a /var/tmp
# WORK dir into the container shows up empty inside it ("bun could not find
# a package.json"). $HOME is real disk everywhere and Docker-Desktop-shared.
ART="${3:-$HOME/.repoos-artifacts}"

WORK="$(mktemp -d "$HOME/.repoos-validate.XXXXXX")"
CACHE="$HOME/.cache/repoos-bun"
IMAGE="${REPOOS_CI_IMAGE:-repoos-ci}"
mkdir -p "$CACHE"
rm -rf "$ART" && mkdir -p "$ART"
# Per-run dirs live under the shared parent; prune ones nobody collected.
find "$HOME/.repoos-artifacts" -mindepth 1 -maxdepth 1 -type d -mtime +1 -exec rm -rf {} + 2>/dev/null || true
trap 'rm -rf "$WORK" "$BUNDLE"' EXIT

echo "[validate] cloning bundle $BUNDLE"
git clone -q "$BUNDLE" "$WORK/repo"
cd "$WORK/repo"
git checkout -q "$SHA" 2>/dev/null || git checkout -q -b _validate "$SHA"

ACTUAL="$(git rev-parse HEAD)"
if [ "$ACTUAL" != "$SHA" ]; then
  echo "[validate] FATAL: checked-out HEAD $ACTUAL != expected $SHA" >&2
  exit 3
fi
echo "[validate] HEAD verified at $SHA"

# The bun base image runs as uid 1000 ('bun'); make the cloned repo and
# artifacts dir writable by that user before entering the container.
chmod -R o+rw "$WORK/repo" "$ART"

set +e
docker run --rm \
  -v "$WORK/repo":/repo \
  -v "$CACHE":/bun-cache \
  -v "$ART":/artifacts \
  -e BUN_INSTALL_CACHE_DIR=/bun-cache \
  -w /repo \
  "$IMAGE" \
  'set -o pipefail; bun install --frozen-lockfile && bun run build && printf "#!/bin/sh\nexec bun /repo/dist/cli/index.js \"\$@\"\n" > /usr/local/bin/repoos && chmod +x /usr/local/bin/repoos && bun run test 2>&1 | tee /artifacts/test-output.log'
CODE=$?
set -e

echo "[validate] gate exit $CODE"
exit $CODE
