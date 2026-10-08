#!/usr/bin/env bash
#
# Runs on the Hetzner runner VM or a Tailscale host. Invoked by RepoOS over ssh:
#
#   /opt/repoos/validate.sh <bundle-path> <expected-sha> [artifacts-dir] [changed-ref] [mirror-path]
#
# Restores the candidate tree from a git bundle, hard-verifies it is exactly the
# SHA RepoOS asked for, then runs `bun install && bun run build && bun run test`
# inside the prebuilt `repoos-ci` container with a persistent bun cache.
#
# When `mirror-path` is given, the bundle is fetched into a persistent bare
# mirror on the host (`~/.repoos-cache/<repo>.git`) and the candidate is checked
# out from there. That lets RepoOS upload only the commits the host does not
# already have (#0717): a partial `<base>..HEAD` bundle a few KB in size instead
# of the full ~100 MB history every run. The mirror is maintained locally; a run
# whose bundle does not apply to it fails the SHA check rather than guessing.
#
# Exit codes: 0 = green. 3 = SHA/bundle/mirror transport (never a test failure).
# 4 = clone/install/setup failed before the gate ran. 5 = container could not
# start. Any other non-zero after "[validate] gate exit N" = build/test failed.
set -euo pipefail

BUNDLE="${1:?usage: validate.sh <bundle-path> <expected-sha>}"
SHA="${2:?usage: validate.sh <bundle-path> <expected-sha>}"
# Optional: vitest changed-path ref (e.g. main) for engineer self-checks (#0695).
CHANGED_REF="${4:-}"
# Optional: persistent per-repo bare mirror (#0717). Empty = legacy full-bundle
# clone, so an older RepoOS against a newer script still works.
MIRROR="${5:-}"
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

# Run-scoped container name (#0729): a hang is killed precisely by name, never
# by a blanket docker kill that could take a sibling run's container. RepoOS
# passes a unique name; a standalone run without one gets a pid-based default.
CONTAINER="${REPOOS_CONTAINER:-repoos-validate-$$}"
# Per-slot cache base (#0729): the shared `repoos-bun-cache` volume let
# concurrent runs on one host corrupt each other's `bun install`. The slot
# index acquired by the host lock below is appended, so runs that may overlap
# (a host with maxConcurrent > 1) never write the same cache dir.
CACHE_VOLUME_BASE="${REPOOS_CACHE_VOLUME:-repoos-bun-cache}"
IMAGE="${REPOOS_CI_IMAGE:-repoos-ci}"

# Remove containers left by finished/killed runs — a `docker run --rm` that was
# SIGKILLed (ssh dropped, host rebooted) leaves its container behind (#0729).
# Only NOT-RUNNING containers (status=created|exited|dead) are swept: this run
# may start while a sibling run on the same host (maxConcurrent > 1) is still
# executing, and removing that one would be a false hang kill.
docker ps -aq --filter "name=repoos-validate-" \
  --filter status=created --filter status=exited --filter status=dead 2>/dev/null \
  | xargs -r docker rm -f >/dev/null 2>&1 || true

# No global sweep of $HOME/.repoos-validate.* at startup (#0729): it runs before
# the host lock and before this run's container exists, so a sibling run's work
# dir is invisible to any mount-based guard in the pre-container window and
# gets `rm -rf`ed out from under a live /repo bind-mount. This run's EXIT
# trap removes its own $WORK; stale dirs are left for a separate safe GC path.

WORK="$(mktemp -d "$HOME/.repoos-validate.XXXXXX")"
rm -rf "$ART" && mkdir -p "$ART"
# Per-run dirs live under the shared parent; prune ones nobody collected.
find "$HOME/.repoos-artifacts" -mindepth 1 -maxdepth 1 -type d -mtime +1 -exec rm -rf {} + 2>/dev/null || true
_rvcleanup() {
  # All files are created by the SSH user's uid (--user flag on the Docker
  # run below), so a plain rm is sufficient — no chown container needed.
  # Kill THIS run's container too: a signal (or a runner-side hang kill that
  # races our exit) must not leave it running (#0729).
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK" "$BUNDLE"
}
trap _rvcleanup EXIT

# The host-lock wrapper exports the acquired slot index as REPOOS_SLOT (#0729);
# a standalone run has no slot and uses the base volume.
SLOT="${REPOOS_SLOT:-0}"
case "$SLOT" in ""|*[!0-9]*) SLOT=0 ;; esac
if [ "$SLOT" = "0" ]; then
  CACHE_VOLUME="$CACHE_VOLUME_BASE"
else
  CACHE_VOLUME="${CACHE_VOLUME_BASE}-slot${SLOT}"
fi

if [ -n "$MIRROR" ]; then
  # ── incremental path (#0717) ──────────────────────────────────────────────
  # Fetch the bundle into the persistent mirror, then check the candidate out
  # of it. A partial bundle only applies when the mirror already holds its
  # prerequisite base; if it does not, the fetch fails and exit 3 is a
  # transport error, not a test result.
  if [ ! -d "$MIRROR" ]; then
    mkdir -p "$(dirname "$MIRROR")"
    git init -q --bare "$MIRROR"
  fi
  # Bundle refs are per-run (`refs/repoos/candidate-<id>`); normalize them onto
  # the stable names the mirror keeps so the next run can probe and reuse them.
  # git bundles reject wildcard refspecs, so discover the exact refs first.
  CANDIDATE_SRC="$(git bundle list-heads "$BUNDLE" | awk '$2 ~ /^refs\/repoos\/candidate/ {print $2; exit}')"
  if [ -z "$CANDIDATE_SRC" ]; then
    echo "[validate] FATAL: $BUNDLE carries no refs/repoos/candidate ref" >&2
    exit 3
  fi
  if ! git -C "$MIRROR" fetch -q --no-tags --force "$BUNDLE" \
      "+${CANDIDATE_SRC}:refs/repoos/candidate" 2>/dev/null; then
    echo "[validate] FATAL: could not fetch $BUNDLE into the mirror $MIRROR" >&2
    echo "[validate] (a partial bundle whose base the mirror does not hold, or a corrupt bundle)" >&2
    exit 3
  fi
  if [ -n "$CHANGED_REF" ]; then
    # Bring the scope ref (the changed-ref base) in under its own name so the
    # in-container `--changed <ref>` resolves (#0695).
    SCOPE_SRC="$(git bundle list-heads "$BUNDLE" | awk '$2 ~ /^refs\/repoos\/scope/ {print $2; exit}')"
    if [ -n "$SCOPE_SRC" ]; then
      git -C "$MIRROR" fetch -q --no-tags --force "$BUNDLE" \
        "+${SCOPE_SRC}:refs/heads/${CHANGED_REF}" 2>/dev/null || true
    fi
  fi
  MIRROR_SHA="$(git -C "$MIRROR" rev-parse --verify --quiet refs/repoos/candidate || true)"
  if [ "$MIRROR_SHA" != "$SHA" ]; then
    echo "[validate] FATAL: mirror candidate $MIRROR_SHA != expected $SHA" >&2
    exit 3
  fi
  echo "[validate] cloning mirror $MIRROR at $SHA"
  git clone -q "$MIRROR" "$WORK/repo"
else
  # ── full-history fallback ─────────────────────────────────────────────────
  echo "[validate] cloning bundle $BUNDLE"
  git clone -q "$BUNDLE" "$WORK/repo"
fi

cd "$WORK/repo"
git checkout -q "$SHA" 2>/dev/null || git checkout -q -b _validate "$SHA"

ACTUAL="$(git rev-parse HEAD)"
if [ "$ACTUAL" != "$SHA" ]; then
  echo "[validate] FATAL: checked-out HEAD $ACTUAL != expected $SHA" >&2
  exit 3
fi
echo "[validate] HEAD verified at $SHA"

# Run Docker as the SSH user's uid:gid so all files it creates are owned by
# that user.  This means _rvcleanup needs no Docker chown step — a plain
# rm -rf works.  Chown the bun-cache volume to match before the main run.
if ! docker run --rm -v "$CACHE_VOLUME":/bun-cache -u 0 "$IMAGE" \
  "chown -R $(id -u):$(id -g) /bun-cache"; then
  echo "[validate] FATAL: could not prepare bun cache volume (docker)" >&2
  exit 5
fi

set +e
docker run --rm \
  --name "$CONTAINER" \
  -v "$WORK/repo":/repo \
  -v "$CACHE_VOLUME":/bun-cache \
  -v "$ART":/artifacts \
  -e BUN_INSTALL_CACHE_DIR=/bun-cache \
  -e BUN_TMPDIR=/tmp \
  -e HOME=/repo \
  -w /repo \
  --user "$(id -u):$(id -g)" \
  "$IMAGE" \
  "set -o pipefail; bun install --frozen-lockfile || exit 4; bun run build && printf '#!/bin/sh\nexec bun /repo/dist/cli/index.js \"\$@\"\n' > /tmp/repoos && chmod +x /tmp/repoos && export PATH=\"/tmp:\$PATH\" && if [ -n \"${CHANGED_REF}\" ]; then bun run test -- --changed \"${CHANGED_REF}\"; else bun run test; fi 2>&1 | tee /artifacts/test-output.log"
CODE=$?
set -e

if [ "$CODE" -eq 4 ]; then
  echo "[validate] setup failed (exit 4)" >&2
  exit 4
fi
if [ "$CODE" -eq 5 ]; then
  echo "[validate] container could not start (exit 5)" >&2
  exit 5
fi

echo "[validate] gate exit $CODE"
exit $CODE
