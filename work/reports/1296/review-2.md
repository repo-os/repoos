---
task: "1296"
pass: 2
at: "2026-11-28T01:23:40.449Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/publish-the-android-hub-apk-from-your-ma
state: ok
tree_identity: "2301f923e:2301f923e9"
---
## Verdict

`good to go` — Pass-1 artifact path bugs are fixed; the slice matches the acceptance criteria and handoff evidence shows the unpublished Android state.

## Relevance

`still relevant` — GitHub-release Android downloads are replaced by maintainer Mac publish to R2 and Worker-served repoos.org URLs, which the spec still requires.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `mobile/scripts/publish-hub-apk.ts`, `mobile/scripts/publish-hub-apk-paths.ts`, `justfile` (`build-android-release`, `publish-hub-apk`), `landing/worker.ts`, `landing/src/components/HubDownloadLink.vue`, `src/ui-app/tests/publish-hub-apk.test.ts`, `hub-download-*.test.ts`, branch `git diff main...HEAD` for bare `node`/`npm`/`npx`.

## Edge cases

Live R2 upload, wrangler deploy, and a signed release build were correctly out of scope; refusal paths and Worker routes are tested with fakes. Credential tests exit before Gradle, so path regression is only guarded by the dedicated paths unit test, not a full `--dry-run` run. APK-then-`version.json` upload ordering limits the window where metadata advertises a missing APK.

## Suggestions

Add an optional maintainer `--dry-run` smoke once signing is configured. After first publish, deploy the landing Worker so `/downloads/*` bindings go live (human step). Close-out will take main’s copy of the task file per the landing checklist.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-28T01:22:48.794Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

