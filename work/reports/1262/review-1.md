---
task: "1262"
pass: 1
at: "2026-11-20T04:18:45.939Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-checks-page-and-check-history-vi
state: ok
tree_identity: "bc9873ebd:61e1ce709"
---
## Verdict
`needs some work` — the new local-slots error line still renders dim, not red: `.ck-local-slots > p` (specificity 0,2,1 with scope attr) beats `.ck-err` (0,2,0), so the error state added in this diff is not visibly an error.

## Relevance
`still relevant` — the QA defects (false "empty" on failure, unreachable scrollers, unstyled pipeline block) are real and the fixes are sound except the status-color specificity below.

## Evidence
None

## Bugs
- **Class: container-wide sibling selector overrides status colors** — `src/ui-app/src/views/ChecksView.vue` line 759 `.ck-local-slots > p { color: var(--txt-dim) }` out-specifies `.ck-err` and `.ck-slot-notice`, so inside the Local check slots panel: (1) the new failed-load line "Could not load local check slots: …" (line 447) renders dim, not red; (2) `slotActionError` (line 480) — pre-existing, same cause; (3) `slotActionNotice` (line 477) renders dim, not green. The old pill rule also set this color, so removing it fixed borders/background but never restored red/green, contrary to the engineering report's claim ("lost their red and green"). The QA test asserts text only, which is why the green check missed it. Fix by raising specificity (e.g. `.ck-local-slots > p.ck-err` / `.ck-slot-notice`) or moving the status colors onto more specific selectors. Note this is exactly the class the report claims was fixed — one-line CSS change.

No further findings of this class were found after grepping: all `> p {` container rules in `src/ui-app/src` (only this one sets a color), `.cr-err` vs `.cr-panel` in CheckRunsPanel (no sibling override), `.ck-err` uses elsewhere (lines 494/496/696 sit outside `.ck-local-slots`, unaffected).

## Edge cases
- Slot polling fails after a success: holders are retained and the alert shows — correct; a later success clears the error.
- `loadActiveChecks` catch clears `activeCheckRuns`, but the section only renders when non-empty, so it under-reports silently rather than claiming "none" — acceptable, consistent with the pipeline's silent catch.
- `Try again` calls `load()`, which resets `error` first — no stuck error state.
- Negative queue wait (`since` in the future) renders "-1234ms" — pre-existing `fmtDuration` behavior.

## Suggestions
- Declared shot 1 says "at phone width" but was captured at 1280×800 (`viewportWidth: null` in the plan). The capture itself is valid and current (sourceIdentity matches reviewed HEAD) — recapture at 375 or reword the label.
- Both captures render correctly: plan tab wraps long step names/commands inside cards; now tab shows the pipeline's local-slot block with divider and label style. No blank or stale captures; console log clean.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T04:16:16.174Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

