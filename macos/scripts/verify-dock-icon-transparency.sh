#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
  echo "macos-hub-icon-transparency: skipped (requires macOS)"
  exit 0
fi

root="$(cd "$(dirname "$0")/../.." && pwd)"
exec swift "$root/macos/scripts/verify-dock-icon-transparency.swift"
