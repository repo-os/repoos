---
task: "1171"
pass: 2
at: "2026-11-18T03:12:28.615Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-android-hub-web-ui-fixtures-many
state: ok
tree_identity: "0487071a0:"
---
## Verdict
`needs some work` — the three round-1 spots are wrapped correctly, but the same "unwrappable text" class remains in the dev-update dialog's server-supplied notes.

## Relevance
`still relevant` — the 375px fixture sweep and its wrap fixes still add real coverage before device QA (#1162).

## Evidence
None

## Bugs
- **Class: long-text overflow (missing wrapping)** — `mobile/src/App.vue:368` renders the dev-update manifest's `notes` inside `.update-dialog li` (`mobile/src/style.css:894`), which sets no `overflow-wrap`. At 375px the panel's content box is ~279px, and the backdrop/grid does not clip, so one unbroken note token paints across the scrim instead of wrapping. These notes are remote and unvalidated (`mobile/src/dev-updates.ts:32` reads `latest.json`; `scripts/publish-dev.sh` fills `notes` from arbitrary task titles), so round 2's claim that "the rest of the hub's text is either fixed UI copy or already truncates" does not hold. Add `overflow-wrap: anywhere` to the `.update-dialog` text rules, add a row for it to the existing table test in `src/ui-app/tests/mobile-hub-picker-layout.test.ts`, and correct `docs/qa/2026-11-android-hub-fixtures.md:62`, which records the class as closed at four selectors.

No further findings of this class were found after grepping: all `{{ }}` interpolations in `App.vue`, `ServerListView.vue`, `AddServerView.vue`, `SettingsView.vue`, `TailnetDiscoveryView.vue`, `BottomSheet.vue`, `LockOverlay.vue`, `mobile/src/style.css` text rules and their `overflow` declarations, `fixture.ts`, `dev-updates.ts`, `scripts/publish-dev.sh`, `src/ui-app/tests/mobile-*.test.ts`.

## Edge cases
- `.form-error` (add form) also lacks wrapping, but every string it can show is fixed copy from `reachability.ts`, so no unbroken token is reachable there.
- `.server-name` / `.server-host` / `.discovery-trust-host` truncate with an ellipsis by design — accepted in pass 1, not the wrapping defect.
- The browser measurements and "console clean" claims can't be reproduced from the branch: the Playwright harness is scratch-only and no PNGs are committed.

## Suggestions
Commit the measurement harness (or add a `?fixture=error` route) so the QA doc's numbers and interaction steps are reproducible, and attach the rendered 375px PNGs to the task.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

