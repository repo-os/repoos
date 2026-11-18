---
task: "1169"
pass: 1
at: "2026-11-18T02:32:57.478Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-macos-repoos-hub-app-build-launc
state: ok
tree_identity: "7acd82eec:"
---
## Verdict
`needs some work` — the QA pass never reached the projects/tasks screens, and it rewrote Nick's real Hub registry while the record claims isolation.

## Relevance
`needs rescoping` — #1155 and the near-identical #1167 QA pass already fixed and exercised the Hub on 2026-11-17; the "unusable for weeks" premise is stale, and the only distinct work left is the signed-in check this pass skipped.

## Evidence
None

## Bugs
- **Class: QA isolation** — `docs/qa/2026-11-macos-hub-qa.md` states the registry was isolated with `REPOOS_HUB_SUPPORT_DIRECTORY`, but a Hub process from this pass wrote the real registry: `~/Library/Application Support/RepoOS Hub/servers.json` was rewritten at 02:22:55Z (this pass's window) and carries a new `/` route visit (`lastVisitedAt 2026-11-18T02:22:55Z`, server `7B800A52…`). `xcodebuild test` starts the app as `TEST_HOST` (`macos/RepoOSHub.xcodeproj/project.pbxproj:194-195`) with the override unset, and the direct-exec launch is likewise unproven isolated. The record's "Checked" row, "Scope" line and "Not verified" section all omit this; the engineer's own report leaves it as an open question instead of documenting it.
- **Class: incomplete acceptance coverage** — `docs/qa/2026-11-macos-hub-qa.md` leaves the task's Desired UX ("shows projects/tasks without errors") unverified: the run stops at the sign-in page, no code or test exercises the logged-in screens, and "Fixed" records no fix. A pass that cannot reach the primary screen does not establish the premise this task exists to resolve.

No further findings of this class were found after grepping: `ServerRegistryStore.applicationSupportDirectory` (`:114`), `ServerRegistryStoreTests.swift:38`, the `macos/README.md` isolation recipe, the `TEST_HOST`/`BUNDLE_LOADER` build settings, both documented launch paths (direct exec and `open -n --env`), and the QA doc's Scope/Checked/Not-verified sections.

## Edge cases
- A direct exec produced "no visible window"; that is not proof of a crash — AppKit may leave the window unfocused behind other apps. The record should say whether a window existed (CGWindow bounds) rather than imply a launch-path quirk.
- Synthetic AppleScript clicks not reaching the `WKWebView` email field is a known automation limitation; it does not show a Hub input bug, but the record should say so explicitly.
- `xcodebuild test` writing the real registry recurs on every run until the test plan/scheme sets `REPOOS_HUB_SUPPORT_DIRECTORY`.

## Suggestions
- Attach the window-only PNGs (or cite their paths) to the task; none are present, so "captures looked fine" is unverifiable.
- Add the unisolated test-host write to the QA record and consider an isolated test-plan environment variable as the "fix with tests where possible".
- Note that #1167 already covered much of this ground; the remaining task is the signed-in projects/tasks check.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

