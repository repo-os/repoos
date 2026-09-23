#!/usr/bin/env bash
#
# Native macOS remote validation runner (no Docker).
# Invoked by RepoOS over ssh as:
#
#   /opt/repoos/validate.sh <bundle-path> <expected-sha>
#
# Restores the candidate tree from a git bundle, hard-verifies it is exactly
# the SHA RepoOS asked for, then runs bun install + build + test natively.
#
# Exit codes: 0 = green. 3 = SHA mismatch. Anything else = build/test failure.
set -euo pipefail

BUNDLE="${1:?usage: validate.sh <bundle-path> <expected-sha>}"
SHA="${2:?usage: validate.sh <bundle-path> <expected-sha>}"

WORK="$(mktemp -d /tmp/repoos-validate.XXXXXX)"
ART="/tmp/repoos-artifacts"
CACHE="/tmp/repoos-bun-cache"
mkdir -p "$CACHE" "$ART"
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

export BUN_INSTALL_CACHE_DIR="$CACHE"
export PATH="/opt/homebrew/bin:$PATH"

set +e
(
  set -o pipefail
  bun install --frozen-lockfile \
    && bun run build \
    && echo "#!/bin/sh" > "$WORK/repoos" \
    && echo "exec bun $WORK/repo/dist/cli/index.js \"\$@\"" >> "$WORK/repoos" \
    && chmod +x "$WORK/repoos" \
    && export PATH="$WORK:$PATH" \
    && bun run test
) 2>&1 | tee "$ART/test-output.log"
CODE=${PIPESTATUS[0]}
set -e

echo "[validate] gate exit $CODE"
exit $CODE
