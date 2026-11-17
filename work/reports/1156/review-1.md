---
task: "1156"
pass: 1
at: "2026-11-17T15:59:26.878Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-android-dev-build-update-channel-new
state: ok
tree_identity: "4ba9c79ce:"
---
## Verdict
`needs some work` — Worker lacks CORS so the WebView fetch is blocked and the dialog never appears; plus dialog CSS, versionCode and setup defects.

## Relevance
`still relevant` — there is no existing dev update channel in `mobile/`, and `deploy-phone` still needs wireless-adb ports, so the premise holds.

## Evidence
None

## Bugs
- **Class: missing CORS on cross-origin fetch** — `mobile/dev-update-worker/index.ts`: responses carry no `Access-Control-Allow-Origin`. The Capacitor shell runs at `https://localhost`, so `fetch(.../latest.json)` in `dev-updates.ts` is blocked by the WebView (it is silent by design, so "Check now" and the on-open check can never fire). The repo server already sets `Access-Control-Allow-Origin: *` (`src/server/server.ts`), proving the pattern. Add the header to `SECURITY_HEADERS`.
- **Class: undefined CSS tokens/classes** — `mobile/src/style.css` + `App.vue`: `.update-dialog` uses `--surface`/`--text` (undefined; tokens are `--panel-solid`/`--txt`), so the dialog is always white with black text in dark themes. `.primary-button`/`.secondary-button` do not exist anywhere (existing classes are `.btn-primary`/`.btn-ghost`), so both actions render as unstyled text with no primary affordance.
- **Class: feature gate on children not container** — `SettingsView.vue`: the new `<section class="settings-group">` is unconditional, only its children are `v-if="devUpdateEnabled"`. In the public release build (`hubDevUpdatePackage` empty) Settings shows an empty bordered card at the top.
- **Class: Gradle env-derived version not invalidated** — `justfile` `build-android` never runs `clean`; `publish-dev.sh`'s local path builds through it. `REPOOS_APP_VERSION_CODE` changes are not task inputs (the repo's own `build-android-release` comment), so a local publish can ship an APK whose packaged `versionCode` is stale while `latest.json` claims the new one — Android refuses the install. `build-android-release` cleans; the debug publish path must too (or publish from a clean checkout).
- **Class: channel injected only by the publisher** — `publish-dev.sh` is the only place `VITE_HUB_*` is set, so `just build-android`/`deploy-phone` produce a dev APK with the channel disabled and versionCode 10000. Running the documented adb backup after a channel install silently turns updates off until reinstall. The spec asks the dev BuildConfig to read the token source.
- **Class: setup instructions contradict the deployment** — task #1158 tells Nick to attach the R2 bucket itself to `hub-dev-updates.repoos.org` and claims objects include the token; object keys are `latest.apk`/`latest.json` and only the Worker enforces the token, so step 2 either conflicts with the route or exposes the bucket without token/noindex. It also omits the three GitHub Actions secrets the workflow needs.
- **Class: changelog source** — `publish-dev.sh` builds `notes` from `git log -8 --format=%s`, so phones show `WIP: engineer self-check checkpoint (#…)` and merge subjects rather than landed task lines.

No further findings of this class were found after grepping: worker header/path handling, APK browser path, SettingsView sections, mobile token/class definitions, `justfile` build recipes, `build.gradle`, publish workflow, `deploy-phone`, docs and #1158.

## Edge cases
`devUpdate.commit` is used unvalidated (`.slice`), so a manifest with a valid versionCode but missing commit breaks rendering; 8 long note lines can overflow the non-scrolling dialog; "Download now" leaves the dialog open; the hourly timestamp is written before the fetch, so one failure suppresses retries for an hour.

## Suggestions
Also run `check-mobile-release-channel.sh` in `android-hub.yml`'s release job and `just build-android-release`, not only the publish workflow; dismiss the dialog after opening the APK; make the dialog scrollable.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

