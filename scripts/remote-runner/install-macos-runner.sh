#!/usr/bin/env bash
# Install the native macOS validate.sh on a remote host.
# Usage: ./install-macos-runner.sh [host]   (default: mini)
set -euo pipefail

HOST="${1:-mini}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[install] copying validate.sh to $HOST:/opt/repoos/validate.sh"
ssh "$HOST" "mkdir -p /opt/repoos"
scp "$SCRIPT_DIR/validate-macos.sh" "$HOST:/opt/repoos/validate.sh"
ssh "$HOST" "chmod +x /opt/repoos/validate.sh"

echo "[install] verifying bun on $HOST"
ssh "$HOST" "/opt/homebrew/bin/bun --version" || {
  echo "[install] bun not found at /opt/homebrew/bin/bun on $HOST"
  exit 1
}

echo "[install] verifying git on $HOST"
ssh "$HOST" "git --version"

echo "[install] done — $HOST is ready as a native macOS runner"
