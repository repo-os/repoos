#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"
if [ -f "$ROOT/.repoos/dev-update-channel.env" ]; then
  # shellcheck disable=SC1090
  source "$ROOT/.repoos/dev-update-channel.env"
fi
bun install
env -u VITE_HUB_DEV_UPDATE_BASE_URL \
  -u VITE_HUB_DEV_UPDATE_PACKAGE \
  -u VITE_HUB_BUILD_COMMIT \
  -u VITE_HUB_VERSION_CODE \
  bun run build
if rg -Fq "hub-dev-updates.repoos.org" www; then
  echo "Dev update endpoint leaked into the release web bundle." >&2
  exit 1
fi
if [ -n "${REPOOS_HUB_DEV_UPDATE_TOKEN:-}" ]; then
  if ! REPOOS_CHANNEL_TOKEN="$REPOOS_HUB_DEV_UPDATE_TOKEN" bun -e '
    const token = Bun.env.REPOOS_CHANNEL_TOKEN;
    for (const path of new Bun.Glob("**/*").scanSync("www")) {
      const file = Bun.file(`www/${path}`);
      if ((await file.text()).includes(token)) {
        console.error("Dev channel token leaked into the release web bundle.");
        process.exit(1);
      }
    }
  '; then
    echo "Dev channel token leaked into the release web bundle." >&2
    exit 1
  fi
fi
echo "Release web bundle has no dev update endpoint."
