#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SECRETS="$ROOT/.repoos/dev-update-channel.env"
if [ -f "$SECRETS" ]; then
  # shellcheck disable=SC1090
  set -a
  source "$SECRETS"
  set +a
fi
: "${REPOOS_HUB_DEV_UPDATE_TOKEN:?missing channel token}"
: "${CLOUDFLARE_API_TOKEN:?missing Cloudflare API token}"

BUCKET="repoos-hub-dev-updates"
HOST="https://hub-dev-updates.repoos.org"
VERSION_CODE="$(git rev-list --count HEAD)"
COMMIT="$(git rev-parse --short=12 HEAD)"
VERSION_NAME="$(bun -e 'console.log(JSON.parse(await Bun.file("mobile/package.json").text()).version)')"
export REPOOS_APP_VERSION_CODE="$VERSION_CODE"
export REPOOS_HUB_BUILD_COMMIT="$COMMIT"
if [ "${CI:-}" = "true" ]; then
  cd mobile
  bun install
  bun run build
  bun run sync
  cd android
  ./gradlew clean assembleDebug
  cp app/build/outputs/apk/debug/app-debug.apk ../app-debug.apk
  cd "$ROOT"
else
  just build-android
fi

APK="$ROOT/mobile/app-debug.apk"
META="$ROOT/mobile/dev-update-latest.json"
BASE_SHA="${REPOOS_DEV_UPDATE_BASE_SHA:-}"
if [ -z "$BASE_SHA" ] || ! git cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
  BASE_SHA="$(git rev-parse HEAD^ 2>/dev/null || git rev-parse HEAD)"
fi
bun -e '
  const [versionName, versionCode, commit, baseSha, out] = Bun.argv.slice(1);
  const changed = await Bun.$`git diff --name-only ${baseSha} HEAD -- work`.text();
  const notes = [];
  for (const path of changed.trim().split("\n").filter((name) => /^work\/\d+-.+\.md$/.test(name))) {
    const source = await Bun.file(path).text();
    const status = source.match(/^status:\s*([\w-]+)/m)?.[1];
    const titleLine = source.match(/^title:\s*(.+)$/m)?.[1];
    if (status !== "done" || !titleLine) continue;
    const title = titleLine.replace(/^(["\x27])|(["\x27])$/g, "").trim();
    if (title && !notes.includes(title)) notes.push(title);
  }
  const manifest = { versionName, versionCode: Number(versionCode), commit, builtAt: new Date().toISOString(), notes: notes.slice(0, 8) };
  await Bun.write(out, JSON.stringify(manifest, null, 2) + "\n");
' -- "$VERSION_NAME" "$VERSION_CODE" "$COMMIT" "$BASE_SHA" "$META"

export CLOUDFLARE_API_TOKEN
if ! bunx --yes wrangler r2 object put "$BUCKET/latest.apk" --file "$APK" --content-type application/vnd.android.package-archive >/dev/null 2>&1; then
  rm -f "$META"
  echo "Dev APK upload failed. Check the local Cloudflare R2 setup." >&2
  exit 1
fi
if ! bunx --yes wrangler r2 object put "$BUCKET/latest.json" --file "$META" --content-type application/json >/dev/null 2>&1; then
  rm -f "$META"
  echo "Dev metadata upload failed. Check the local Cloudflare R2 setup." >&2
  exit 1
fi
rm -f "$META"
echo "Published Hub dev build for commit $COMMIT."
