---
task: "1171"
pass: 1
at: "2026-11-18T03:02:59.767Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-android-hub-web-ui-fixtures-many
state: ok
tree_identity: "de6d31ef0:"
---
## Verdict
`needs some work` — long server URLs still clip in the edit sheet, and the QA record marks that case as passing.

## Relevance
`still relevant` — the picker overflow is real and the 375px fixture sweep still adds coverage before device QA (#1162).

## Evidence
None

## Bugs

- **Class: long-text overflow (missing wrapping)** — `mobile/src/App.vue:382` renders `sheetServer.url` in `.hint` (`mobile/src/style.css:168`), which has no `overflow-wrap`/`word-break`; any URL longer than ~52 characters is clipped, not wrapped. Measured at 375px with the real stylesheet: an 87-character `https://…` URL has `scrollWidth` 593 in a 343px box (and a 119-character path URL 772), with the tail clipped by `html, body { overflow: hidden }`. `serverUrlOf` accepts long hosts and paths, so this is reachable from a saved server. The QA doc's "URL wraps inside the sheet" and the 85-character "no break points … the sheet stay in bounds" rows are both false.
- **Class: long-text overflow (missing wrapping)** — `mobile/src/components/TailnetDiscoveryView.vue:67,70`: `.discovery-message` (`style.css:471`) and `.warn` (`style.css:175`) carry server-supplied `message`/`reason` text; a long unbroken string overflows the same way (590/540 vs 343 measured).
- **Class: long-text overflow (missing wrapping)** — `mobile/src/components/TailnetDiscoveryView.vue` failure rows (`style.css:364`): the `Unreachable — <reason>` text in `.reachability` overflows its row (761 vs 319 measured) when the tailnet reason contains a long unbroken token.

Fix with `overflow-wrap: anywhere` on these text containers (plus `min-width: 0` where they sit in a flex row), extend `src/ui-app/tests/mobile-hub-picker-layout.test.ts` to pin it, and correct the two pass claims in `docs/qa/2026-11-android-hub-fixtures.md`. The `.server-row` fix itself is correct: in a standalone render the 66-character name and long host truncate (183px) and `.more-btn` stays at 311–359 inside the card.

No further findings of this class were found after grepping: `mobile/src/style.css` text rules, `App.vue`, `ServerListView.vue`, `AddServerView.vue`, `SettingsView.vue`, `BottomSheet.vue`, `fixture.ts`, `src/ui-app/tests/mobile-*.test.ts`.

## Edge cases
- No `?fixture=error` route exists, so acceptance criterion 1 is met only by interaction (add-form HTTP error, discovery failure group); the doc discloses this, but the sweep can't be reproduced as written.
- The doc says the pre-fix "name's start was cut off"; it wasn't (it started at x=84). Only the row's end clipped — correct the record.
- The report discloses killing the main checkout's Vite process by PID; that side effect is outside the diff and can't be verified here.

## Suggestions
Add the `overflow-wrap` case to the stylesheet test, add `?fixture=error`, and attach the rendered QA PNGs to the task so the sweep is auditable.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

