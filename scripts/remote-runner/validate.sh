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
# A named Docker volume, NOT a host bind-mount (#0521 review, third round —
# see the chown-init line below for why). The volume lives inside Docker's
# own storage and is shared across every run on this host, exactly like the
# old host directory was.
CACHE_VOLUME="repoos-bun-cache"
IMAGE="${REPOOS_CI_IMAGE:-repoos-ci}"
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

# A fresh named volume is root-owned, mode 0755 by default — uid 1000 can't
# write into it until something chowns it. A HOST bind-mount (the previous
# design) can't be fixed by chmod'ing the host side at all on some setups: on
# macOS via Colima, the bind-mounted directory appears INSIDE the container
# as owned by root with a fixed 0755, ignoring whatever the real host-side
# permissions say — confirmed live, chmod o+rwx on the host directory changed
# nothing about what the container could see (#0521 review, third round). A
# named volume sidesteps that class of host-filesystem-mapping problem
# entirely: it's Docker's own storage, never bind-mounted from the host, so
# a one-time (idempotent, near-instant once already correct) chown as root
# is all it needs — also confirmed live, writable and persists across runs.
docker run --rm -v "$CACHE_VOLUME":/bun-cache -u 0 "$IMAGE" "chown 1000:1000 /bun-cache"

set +e
docker run --rm \
  -v "$WORK/repo":/repo \
  -v "$CACHE_VOLUME":/bun-cache \
  -v "$ART":/artifacts \
  -e BUN_INSTALL_CACHE_DIR=/bun-cache \
  -w /repo \
  "$IMAGE" \
  'set -o pipefail; bun install --frozen-lockfile && bun run build && printf "#!/bin/sh\nexec bun /repo/dist/cli/index.js \"\$@\"\n" > /usr/local/bin/repoos && chmod +x /usr/local/bin/repoos && bun run test 2>&1 | tee /artifacts/test-output.log'
CODE=$?
set -e

echo "[validate] gate exit $CODE"
exit $CODE
