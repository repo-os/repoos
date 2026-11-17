#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SECRETS="$ROOT/.repoos/dev-update-channel.env"
if [ ! -f "$SECRETS" ]; then
  echo "Hub dev channel is not configured. See docs/hub-android-dev-updates.md." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a
source "$SECRETS"
set +a
: "${REPOOS_HUB_DEV_UPDATE_TOKEN:?missing channel token}"
: "${CLOUDFLARE_API_TOKEN:?missing Cloudflare API token}"

BUCKET="repoos-hub-dev-updates"
HOST="https://hub-dev-updates.repoos.org"
VERSION_CODE="$(git rev-list --count HEAD)"
COMMIT="$(git rev-parse --short=12 HEAD)"
VERSION_NAME="$(bun -e 'console.log(JSON.parse(await Bun.file("mobile/package.json").text()).version)')"
VITE_HUB_DEV_UPDATE_BASE_URL="$HOST/dev/$REPOOS_HUB_DEV_UPDATE_TOKEN" \
VITE_HUB_BUILD_COMMIT="$COMMIT" \
VITE_HUB_VERSION_CODE="$VERSION_CODE" \
REPOOS_APP_VERSION_CODE="$VERSION_CODE" \
just build-android

APK="$ROOT/mobile/app-debug.apk"
META="$ROOT/mobile/dev-update-latest.json"
bun -e 'const [versionName, versionCode, commit, out] = Bun.argv.slice(2); const notes = await Bun.$`git log -8 --format=%s`.text(); const manifest = { versionName, versionCode: Number(versionCode), commit, builtAt: new Date().toISOString(), notes: notes.trim().split("\n").filter(Boolean).slice(0, 8) }; await Bun.write(out, JSON.stringify(manifest, null, 2) + "\n");' -- "$VERSION_NAME" "$VERSION_CODE" "$COMMIT" "$META"

export CLOUDFLARE_API_TOKEN
KEY="dev/$REPOOS_HUB_DEV_UPDATE_TOKEN"
if ! bunx --yes wrangler r2 object put "$BUCKET/$KEY/latest.apk" --file "$APK" --content-type application/vnd.android.package-archive >/dev/null 2>&1; then
  rm -f "$META"
  echo "Dev APK upload failed. Check the local Cloudflare R2 setup." >&2
  exit 1
fi
if ! bunx --yes wrangler r2 object put "$BUCKET/$KEY/latest.json" --file "$META" --content-type application/json >/dev/null 2>&1; then
  rm -f "$META"
  echo "Dev metadata upload failed. Check the local Cloudflare R2 setup." >&2
  exit 1
fi
rm -f "$META"
echo "Published Hub dev build for commit $COMMIT."
