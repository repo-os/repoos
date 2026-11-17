# RepoOS Hub Android dev updates

The dev APK reads its update base URL from `VITE_HUB_DEV_UPDATE_BASE_URL` at
Vite build time. `scripts/publish-dev.sh` reads the channel token and Cloudflare
credentials from the ignored `.repoos/dev-update-channel.env` file, builds the
`.dev` Android variant with that URL, and uploads `latest.apk` and
`latest.json` to the R2 bucket `repoos-hub-dev-updates`. The planned custom
domain is `hub-dev-updates.repoos.org`; the object paths are
`dev/<token>/latest.apk` and `dev/<token>/latest.json`.

## Initial account setup

Complete held human task #1158 before publishing. In short, configure the R2
bucket and custom domain in the Cloudflare account used for RepoOS, then put
`REPOOS_HUB_DEV_UPDATE_TOKEN` and `CLOUDFLARE_API_TOKEN` in
`.repoos/dev-update-channel.env`. Generate the path token locally with a secure
random generator; never commit it or paste it into chat. The Cloudflare API
token should be scoped to this bucket for object writes. This file is ignored
by Git through the existing `.repoos/*` rule.

Run `just publish-dev` on demand after setup. Rotation requires replacing the
path token locally, publishing a build containing the new path, installing it,
then deleting the old token's objects. The APK contains its own channel URL so
it can fetch updates; release builds do not receive this Vite variable.

## Phone check

Install the published dev APK once. Open RepoOS Hub Dev while online; checks
are silent and throttled to one automatic attempt per hour. A newer version
offers Download now (Android handles installation) and Later (one-hour snooze).
Settings → Dev updates offers Check now. The release package does not enable the
channel. `just deploy-phone` remains available for local adb installs.

Cloudflare domain activation, response headers, automatic post-landing
publishing, and on-device installation still require account and device
verification. Do not claim those steps are complete until verified.
