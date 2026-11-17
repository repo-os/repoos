---
task: "1156"
pass: 2
at: "2026-11-17T16:53:39.063Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-android-dev-build-update-channel-new
state: ok
tree_identity: "c4b0cf1bd:"
---
## Verdict
`needs some work` — the CI-published APK is unsigned with a stable key and the Worker bootstrap step fails on first run, so updates never land.

## Relevance
`still relevant` — nothing else in `mobile/` provides self-serve dev updates, and `deploy-phone` still depends on an adb port.

## Evidence
None — `shots: skipped` is correct; the mobile shell is not a capture target.

## Bugs
- **Class: APK signing identity continuity** — `.github/workflows/publish-hub-dev.yml` + `mobile/android/app/build.gradle`: the `.dev` variant uses AGP's default debug signing (`~/.android/debug.keystore`). Every GitHub job regenerates that keystore, and it never matches Nick's local one used by `just deploy-phone`/`just build-android`. The first published APK cannot install over his existing dev app, and each subsequent publish uses another key, so "Download now" fails with a signature conflict (or forces an uninstall, losing data). Provision one stable debug keystore (e.g. base64 secret → `~/.android/debug.keystore`) shared by CI and the laptop, or add a dedicated dev signing config.
- **Class: provider first-run ordering** — `.github/workflows/publish-hub-dev.yml`: `wrangler secret put` runs before `wrangler deploy`. A secret can only be attached to an existing Worker, so on a fresh account the step errors (hidden by `>/dev/null 2>&1`), `set -e` aborts the job before deploy and publish, and it can never self-heal. #1158 step 6 claims the first run deploys the Worker. Deploy first, or use `wrangler deploy --secrets-file`.

No further findings of this class were found after grepping: publish workflow steps, `publish-dev.sh`, `check-mobile-release-channel.sh`, justfile `build-android`/`deploy-phone`, `build.gradle` signing/variant config, `android-hub.yml`, #1158 and the docs.

## Edge cases
Review-1 items re-checked and fixed (CORS, CSS tokens/classes, Settings gate, clean build, BuildConfig channel, changelog notes, #1158 setup). Auto-publish only fires when `main` is pushed to origin — RepoOS does that at `repoos release` (local main is 289 commits ahead of `origin/main`), so a landing publishes only at the next release, not on landing. The release JS still bundles the inert `dev-updates` module; URL/token are absent. `manifest.commit` is unvalidated (`slice` throws on a malformed manifest). Concurrent auto-check and Check now can race and clear a just-found dialog. Dialog stays open after Download and isn't dismissed by Android back.

## Suggestions
Run the release-channel guard in `android-hub.yml` PR jobs too; print a short "up to date" result for Check now; stop swallowing wrangler stderr; show the token-generation command in `docs/`; make the dialog scrollable.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

