#!/usr/bin/env bash
# REPOOS_VALIDATE_COMMAND: capability marker consumed by the host probe.
#
# Native remote validation runner (no Docker; Linux or macOS).
# Invoked by RepoOS over ssh as:
#
#   /opt/repoos/validate.sh <bundle-path> <expected-sha> [artifacts-dir]
#
# Restores the candidate tree from a git bundle, hard-verifies it is exactly
# the SHA RepoOS asked for, then runs the configured command or stock Bun gate.
#
# Exit codes: 0 = green. 3 = SHA mismatch. Anything else = build/test failure.
set -euo pipefail

BUNDLE="${1:?usage: validate.sh <bundle-path> <expected-sha>}"
SHA="${2:?usage: validate.sh <bundle-path> <expected-sha>}"
# Per-run artifacts dir (#0520): RepoOS passes a unique one so overlapping runs
# never wipe each other's logs. Without it, fall back to the shared default.
# Under $HOME, not /tmp (matches validate.sh's Docker-based fix, same day):
# macOS periodically clears stale /tmp entries via its own housekeeping, which
# would silently wipe the persistent bun cache here between runs — defeating
# its whole point — and $HOME avoids that as well as any tmpfs-quota concern
# on a host that's also someone's desktop session.
ART="${3:-$HOME/.repoos-artifacts}"

WORK="$(mktemp -d "$HOME/.repoos-validate.XXXXXX")"
CACHE="$HOME/.cache/repoos-bun"
mkdir -p "$CACHE" "$ART"
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

export BUN_INSTALL_CACHE_DIR="$CACHE"
export PATH="/opt/homebrew/bin:$PATH"
export REPOOS_ARTIFACTS_DIR="$ART"

set +e
(
  set -o pipefail
  if [ -n "${REPOOS_BROWSER_CAPTURE_MODE:-}" ]; then
    if [ -n "${REPOOS_BROWSER_CAPTURE_BRANCH:-}" ]; then
      git checkout --detach "$SHA"
      CAPTURE_WORKTREE="$HOME/.repoos-worktrees/$REPOOS_BROWSER_CAPTURE_BRANCH"
      mkdir -p "$(dirname "$CAPTURE_WORKTREE")"
      git worktree add -b "$REPOOS_BROWSER_CAPTURE_BRANCH" "$CAPTURE_WORKTREE" "$SHA"
      cd "$CAPTURE_WORKTREE"
      bun install --frozen-lockfile || exit 4
    fi
    bun scripts/remote-runner/capture-browser.ts \
      "$REPOOS_BROWSER_CAPTURE_TASK" "$REPOOS_BROWSER_CAPTURE_MODE" "$ART/browser-capture"
  elif [ -n "${REPOOS_VALIDATION_COMMAND:-}" ]; then
    echo "[validate] running configured command: $REPOOS_VALIDATION_COMMAND"
    bash -lc 'export PATH="/opt/homebrew/bin:$PATH"; eval "$REPOOS_VALIDATION_COMMAND"'
    CODE=$?
    if [ "$CODE" -eq 0 ] && [ "${REPOOS_OFFLOAD_BROWSER_STEPS:-}" = "1" ]; then
      if [ -f "$WORK/repo/dist/cli/index.js" ]; then
        bun "$WORK/repo/dist/cli/index.js" check \
          --profile "${REPOOS_CHECK_PROFILE:-default}" --step ui-smoke --step rendered-contrast
        CODE=$?
      else
        echo "[validate] browser offload requested, but the project command did not produce dist/cli/index.js" >&2
        CODE=1
      fi
    fi
    exit "$CODE"
  else
    bun install --frozen-lockfile \
      && bun run build \
      && echo "#!/bin/sh" > "$WORK/repoos" \
      && echo "exec bun $WORK/repo/dist/cli/index.js \"\$@\"" >> "$WORK/repoos" \
      && chmod +x "$WORK/repoos" \
      && export PATH="$WORK:$PATH" \
      && bun run test
  fi
) 2>&1 | tee "$ART/test-output.log"
CODE=${PIPESTATUS[0]}
set -e

echo "[validate] gate exit $CODE"
exit $CODE
