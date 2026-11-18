---
task: "1171"
pass: 3
at: "2026-11-18T03:26:07.727Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-android-hub-web-ui-fixtures-many
state: ok
tree_identity: "8c5493fd7:"
---
## Verdict
`good to go` — the round-2 dialog gap is fixed, the unwrappable-text class is closed across the hub, and the QA claims are now reproducible from a committed harness.

## Relevance
`still relevant` — the 375px fixture sweep and wrap fixes still add real coverage before device QA (#1162), which is still open on the board.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: all `{{ }}` interpolations in `App.vue`, `ServerListView.vue`, `AddServerView.vue`, `SettingsView.vue`, `TailnetDiscoveryView.vue`, `BottomSheet.vue`, `LockOverlay.vue`; every text rule in `mobile/src/style.css` (including `white-space: nowrap` users); `reachability.ts` / `app-state.ts` error strings; `dev-updates.ts`; `fixture.ts`; `src/ui-app/tests/mobile-*.test.ts`.

## Edge cases
- No `?fixture=error` route exists: the "error" half of acceptance criterion 1 is met only by the scripted add-form and discovery interactions, and the doc discloses this. Not a code defect, but the fixture list cannot reproduce it directly.
- The doc's "119-character path URL" and "66-character server name" do not match the harness constants (`LONG_PATH_URL` is 134 chars, `LONG_NAME` is 65), so those two figures aren't exactly rerunnable as claimed; the 85/120 figures do match.
- The harness uses fixed 700 ms waits. `checkFits` requires a real element (`count > 0`), so wrap checks can't pass on a blank page, but the in-bounds fixture checks would pass vacuously if a cold Vite render were slower than 700 ms.
- The dev-update dialog's real trigger (remote `latest.json`) is still not exercised; only injected markup with the shipped classes is measured.

## Suggestions
- Align the two doc figures with the harness constants, or say they came from the manual run, since the doc states every number is rerunnable.
- Prefer waiting for a known selector (`hub-server-list`, `.reachability`, …) over fixed timeouts.
- The CSS-pin test cannot catch a layout regression; an optional assertion that `.more-btn` stays inside the card would complement it.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

