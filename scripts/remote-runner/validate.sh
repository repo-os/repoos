#!/usr/bin/env bash
#
# Runs on the Hetzner runner VM. Invoked by RepoOS over ssh as:
#
#   /opt/repoos/validate.sh <bundle-path> <expected-sha>
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

WORK="$(mktemp -d /tmp/repoos-validate.XXXXXX)"
ART="/tmp/repoos-artifacts"
CACHE="/var/cache/repoos/bun"
mkdir -p "$CACHE"
rm -rf "$ART" && mkdir -p "$ART"
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

set +e
docker run --rm --user 0:0 \
  -v "$WORK/repo":/repo \
  -v "$CACHE":/root/.bun/install/cache \
  -v "$ART":/artifacts \
  -w /repo \
  repoos-ci \
  'set -o pipefail; bun install --frozen-lockfile && bun run build && bun run test 2>&1 | tee /artifacts/test-output.log'
CODE=$?
set -e

echo "[validate] gate exit $CODE"
exit $CODE
