---
task: "1156"
pass: 3
at: "2026-11-17T17:10:54.371Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-android-dev-build-update-channel-new
state: ok
tree_identity: "344c2183e:"
---
## Verdict
`good to go` — round-2 blockers are fixed (stable debug keystore restored in CI; Worker deployed before its secret) and I found no code defects.

## Relevance
`still relevant` — nothing in `mobile/` provides a self-serve dev update channel, and `just deploy-phone` still needs a wireless-adb port.

## Evidence
None — `shots: skipped` is correct; the mobile shell is not a capture target.

## Bugs
None found
No further findings of this class were found after grepping: `publish-hub-dev.yml` steps, `publish-dev.sh`, `check-mobile-release-channel.sh`, justfile `build-android`/`deploy-phone`/`publish-dev`, `build.gradle` signing/variant/BuildConfig, `MainActivity`/`HubDevUpdateConfigPlugin`, `dev-updates.ts`/`platform.ts`, `App.vue`/`SettingsView.vue`/`style.css`, `docs/hub-android-dev-updates.md`, #1158 and `android-hub.yml`.

## Edge cases
- Report source `344c218` matches the reviewed tree (`267e66f`); HEAD adds only `round-3.json`.
- Auto-publish is a workflow on push to origin/main; RepoOS pushes main at release, so landings batch until the next release rather than publishing per close-out (criterion 3 allows the release routine).
- `checkForDevUpdate` writes `checkedAt` before the fetch, so one offline/failed check suppresses retries for an hour.
- `manifest.commit` is not validated before `.slice(0, 7)`; a malformed manifest breaks the dialog render (server-controlled input).
- Concurrent on-open check and "Check now" can race; "Download now" leaves the dialog open and Android back does not dismiss it.
- `publish-dev.sh` reads every changed `work/*.md` without `--diff-filter=d`, so a deleted task file would abort publishing. Local publish uses branch commit count, so a later main publish can carry a lower versionCode.
- The update dialog (z-index 1000) renders above the lock overlay (50), so it is usable before unlock.

## Suggestions
- Run `scripts/check-mobile-release-channel.sh` in `android-hub.yml`'s PR and release jobs, not only the main-push publish workflow.
- Dismiss the dialog after Download now, make the notes list scrollable, and give Check now a short "up to date" result.
- Order changelog notes newest-first and filter `--diff-filter=d`.
- Derive `VERSION_CODE` from the pushed main count so local and CI publishes stay monotonic.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

