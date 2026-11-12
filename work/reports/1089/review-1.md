---
task: "1089"
pass: 1
at: "2026-11-12T01:51:26.743Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/easter-eggs-bundle-release-in-progress-s
state: ok
tree_identity: "b3deae68e:09ec8ea25"
---
## Verdict
`good to go` — the change is correct and complete; the only conflict with main is this task's own task file, which close-out resolves from main.

## Relevance
`still relevant` — no other release-run indicator exists on main; the running-state gap the task describes is still present.

## Evidence
None. Captures match the declared routes and state: all four PNGs show the indicator (pill, cut-drawer heading) in light and dark. Evidence tree 09ec8ea25 differs from reviewed HEAD b3deae68e only by `work/` bookkeeping, so it is current.

## Bugs
None found. Checked the running-state wiring (`running` set by POST and poll, cleared only on non-running results), the fixture early return in `pollRun`, the idle/succeeded/failed gating in the test, and the new `release:cutRunning` case in both the core ID list and the server switch. No bare `node`, `npm` or `npx` in the diff.

## Edge cases
- Indicators are rendered inside the disabled-looking "View progress" button and the `<h3>`. Each `role="status"` is nested in a button, and the button's children are presentational, so the status role is not reliably exposed. Also "View progress" is announced twice.
- Pausing when not visible and reduced-motion are inherited from `ActivityIndicator`/`useActivityMotion`. No test covers them here; that is acceptable under the spec, which reuses the component.
- With the drawer open, the page-behind indicators (pill, View progress) still animate under the scrim. They are technically visible to the observer.

## Suggestions
- `shotFixtureReleaseRun` pins `startedAt` to 2026-11-11, so the captures show "1370m 05s elapsed". Derive `startedAt` from `Date.now()` so the capture reads as a real run.
- In the dark pill capture (`default-2`), the "View progress" label and indicator are low-contrast on the disabled button. That is pre-existing disabled styling, not introduced here. Consider it if the button is ever shown as running-but-enabled.
- The engineer hand-synced the worktree copy of `work/1089-…md` after the declared shots went through `repoos api PATCH`. AGENTS.md forbids direct `work/*.md` writes. Close-out takes main's copy, so nothing lands wrong, but the process rule was bent.
- Spec `Files:` lists ActivityIndicator and lib/activity-motion, which are untouched; `shot-fixtures.ts` and `style.css` changed instead. The changes are reasonable, so no action needed beyond noting it.

## Verdict
`good to go` — the change is correct and complete; the only conflict with main is this task's own task file, which close-out resolves from main.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-12T01:50:12.127Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

