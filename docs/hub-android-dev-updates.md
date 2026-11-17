# RepoOS Hub Android dev updates

The dev APK reads its update base URL from `VITE_HUB_DEV_UPDATE_BASE_URL` at
Vite build time. `scripts/publish-dev.sh` reads the channel token and Cloudflare
credentials from the ignored `.repoos/dev-update-channel.env` file, builds the
`.dev` Android variant with that URL, and uploads `latest.apk` and
`latest.json` to the R2 bucket `repoos-hub-dev-updates`. The Worker in
`mobile/dev-update-worker/` serves only those two objects under
`/dev/<token>/...` and adds `X-Robots-Tag: noindex, nofollow, noarchive` to
every response. The Worker has no listing endpoint and rejects other paths.

## Initial account setup

Complete held human task #1158 before publishing. Configure the Cloudflare
account ID, zone, and R2 bucket in `mobile/dev-update-worker/wrangler.jsonc` if
they differ from the defaults, then create a Cloudflare API token scoped to
deploy the Worker and write the R2 bucket. Generate one path token locally and
store `REPOOS_HUB_DEV_UPDATE_TOKEN` plus `CLOUDFLARE_API_TOKEN` in
`.repoos/dev-update-channel.env`. Put the same values, and
`CLOUDFLARE_ACCOUNT_ID`, in the GitHub Actions repository secrets with those
names so the automatic main-branch publisher has access. The ignored local
file is excluded by the existing `.repoos/*` rule. Never commit or paste the
path token or API token into chat.

The workflow `.github/workflows/publish-hub-dev.yml` deploys the Worker and
publishes a dev APK after each main push. Run `just publish-dev` on demand after
local setup. Rotation requires updating the Worker secret, local secret file,
and GitHub Actions secret, publishing a build containing the new path, and
installing it before retiring the old path. The APK contains its channel URL so
it can fetch updates; release builds do not receive this Vite variable.

## Phone check

Install the published dev APK once. Open RepoOS Hub Dev while online; checks
are silent and throttled to one automatic attempt per hour. A newer version
offers Download now (Android handles installation) and Later (one-hour snooze).
Settings → Dev updates offers Check now. The release package does not enable the
channel. `just deploy-phone` remains available for local adb installs.

Cloudflare domain activation and on-device installation still require account
and device verification. Do not claim those steps are complete until verified.
