# RepoOS Hub Android dev updates

The Android debug Gradle variant reads the channel token from the ignored
`.repoos/dev-update-channel.env` file (or the matching process environment in
CI) and places the URL and build commit in its generated `BuildConfig`. The
native `HubDevUpdateConfig` plugin exposes these values to the Hub shell only
for package `org.repoos.mobile.dev`. `just build-android`, `just deploy-phone`,
and `just publish-dev` all use the same source, so a regular debug rebuild does
not disable the channel. The release variant gets empty channel fields.

`scripts/publish-dev.sh` builds the `.dev` variant and uploads `latest.apk` and
`latest.json` to the private R2 bucket `repoos-hub-dev-updates`. The Worker in
`mobile/dev-update-worker/` serves only those two objects under
`/dev/<token>/...`, adds `Access-Control-Allow-Origin: *` for the app WebView,
and sends `X-Robots-Tag: noindex, nofollow, noarchive`. It has no listing
endpoint and rejects other paths.

The published APK must use the same Android debug signing key as local debug
builds so Android can upgrade the installed app without removing its data.
GitHub Actions restores that key from the repository secret
`HUB_DEV_DEBUG_KEYSTORE_BASE64` to `~/.android/debug.keystore` before building.
The laptop uses its normal `~/.android/debug.keystore` for `just build-android`
and `just deploy-phone`; held human task #1158 provisions that existing key to
Actions without printing or committing its contents.

## Initial account setup

Complete held human task #1158 before publishing. Create a private R2 bucket,
configure the Worker route/DNS in `mobile/dev-update-worker/wrangler.jsonc`,
and create a Cloudflare API token with Worker deployment and bucket write
permissions. Do not attach the bucket directly to a public domain: the Worker
is the only public entry point. Generate one path token locally and store
`REPOOS_HUB_DEV_UPDATE_TOKEN`, `CLOUDFLARE_API_TOKEN`, and
`CLOUDFLARE_ACCOUNT_ID` in `.repoos/dev-update-channel.env`. Add those same
three values as GitHub Actions repository secrets with the same names. Also
add `HUB_DEV_DEBUG_KEYSTORE_BASE64` containing a base64 encoding of the laptop's
existing `~/.android/debug.keystore`; this is the signing key for already
installed dev builds and must remain stable. On macOS, copy it to the clipboard
without printing it with `base64 < "$HOME/.android/debug.keystore" | pbcopy`,
then paste it directly into the GitHub secret field. Do not put its value in a
task or chat, and clear the clipboard afterward. The local channel file is
ignored by Git. Never commit or paste secret values into chat.

The workflow `.github/workflows/publish-hub-dev.yml` deploys the Worker and
publishes a dev APK after each main push. Run `just publish-dev` on demand after
local setup. Rotation requires updating the Worker secret, local secret file,
and GitHub Actions secret, publishing a build containing the new path, and
installing it before retiring the old path. The debug APK contains its channel
URL in BuildConfig; the release variant is checked for an empty URL and the
mobile bundle is scanned for the endpoint and configured token.

## Phone check

Install the published dev APK once. Open RepoOS Hub Dev while online; checks
are silent and throttled to one automatic attempt per hour. A newer version
offers Download now (Android handles installation) and Later (one-hour snooze).
Settings → Dev updates offers Check now. The release package does not enable the
channel. `just deploy-phone` remains available for local adb installs.

Cloudflare domain activation and on-device installation still require account
and device verification. Do not claim those steps are complete until verified.
