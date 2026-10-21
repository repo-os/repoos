#!/usr/bin/env bash
# Render the Hub's offscreen layout snapshots and print where they landed.
#
# Usage:
#   macos/scripts/hub-snapshots.sh            # light and dark, into macos/.build/snapshots
#   HUB_SNAPSHOT_SET=shots macos/scripts/hub-snapshots.sh
#                                             # light only (the handoff set)
#   HUB_SNAPSHOT_DIR=/tmp/hub-shots ...       # explicit output directory
#   REPOOS_SHOT_DIR=... macos/scripts/hub-snapshots.sh
#                                             # what RepoOS's [[shot.targets]] row passes
#
# The suite renders NSHostingViews into bitmaps; it never creates or orders a
# window. See docs/macos-hub-snapshots.md and macos/README.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_DIR="${HUB_SNAPSHOT_DIR:-${REPOOS_SHOT_DIR:-$REPO_ROOT/macos/.build/snapshots}}"

export HUB_SNAPSHOT_DIR="$SNAPSHOT_DIR"
# xcodebuild does not forward the shell environment to the test host; the
# TEST_RUNNER_ prefix is the supported way to pass a variable through (the
# prefix is stripped before the test process sees it).
export TEST_RUNNER_HUB_SNAPSHOT_DIR="$SNAPSHOT_DIR"
if [ -n "${REPOOS_SHOT_DIR:-}" ]; then
  export TEST_RUNNER_REPOOS_SHOT_DIR="$REPOOS_SHOT_DIR"
fi
if [ -n "${HUB_SNAPSHOT_SET:-}" ]; then
  export TEST_RUNNER_HUB_SNAPSHOT_SET="$HUB_SNAPSHOT_SET"
fi
mkdir -p "$SNAPSHOT_DIR"
# A reduced run should not leave the other appearance's stale images behind.
rm -f "$SNAPSHOT_DIR"/hub-*.png

echo "Rendering Hub snapshots into: $SNAPSHOT_DIR"
if [ -n "${HUB_SNAPSHOT_SET:-}" ]; then
  echo "Snapshot set: $HUB_SNAPSHOT_SET"
fi

xcodebuild \
  -project "$REPO_ROOT/macos/RepoOSHub.xcodeproj" \
  -scheme RepoOSHub \
  -destination 'platform=macOS' \
  -derivedDataPath "$REPO_ROOT/macos/.derived-data" \
  -only-testing:RepoOSHubTests/HubSnapshotTests \
  CODE_SIGNING_ALLOWED=NO \
  test

echo ""
echo "Hub snapshot files:"
if compgen -G "$SNAPSHOT_DIR/hub-*.png" > /dev/null; then
  ls -lh "$SNAPSHOT_DIR"/hub-*.png
else
  echo "  (none — the tests skipped because offscreen rendering was unavailable)"
fi
