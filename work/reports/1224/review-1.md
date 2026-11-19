---
task: "1224"
pass: 1
at: "2026-11-19T09:32:45.668Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-first-run-onboarding-and-empty-p
state: ok
tree_identity: "dac32fccc:14c343735d"
---
## Verdict
`good to go` — empty-state de-escalation, fixture and tests are correct; capture is current and shows the declared state.

## Relevance
`still relevant` — main has only bookkeeping since; no other task covers first-run Work/Agents/Checks states.

## Evidence
None.

## Bugs
None found

No further findings of this class were found after grepping: `src/ui-app/src` empty-state copy (`No matching`/`No tasks yet` — only `TaskDependencyPicker.vue`, a different user moment), `var(--red)` near empty states (`ChecksView`, `IntegrationStatusBar`, `CheckRunsPanel` — all already amber/neutral per #0592), fixture registration chain (`shot-fixtures.ts` id + `applyShotPreviewFixture` case + `resetShotFixturePins` + `SHOT_PREVIEW_APPLIED_ATTR` + `shot-preview-fixtures.test.ts`), pin consumers (`shotFixturePinned*` siblings in `CheckRunsPanel`, `RepoDirtyPanel`, `RemoteRunnersPanel`, `stores/repo.ts`), and the diff itself for bare `node`/`npm`/`npx` (none; both QA scripts use `#!/usr/bin/env bun`).

## Edge cases
- The reworded red paragraph (`source ≠ empty`, zero steps, zero errors) is defensively unreachable per `check-skip.ts` (`resolveCheckPlan` only yields zero steps with source `empty`) — correct to keep, untested branch.
- Pinned `load()` early-return skips only the plan fetch; check-run/live data comes from separate store watchers, and Refresh/profile/changed-path handlers re-hit the pin instead of erroring.
- `plan.errors` non-empty: red paragraph suppressed but errors render separately (`.ck-error-line`), and the reminder is correctly withheld (`isGenuinelyEmptyPlan` = source empty ∧ 0 steps ∧ 0 errors).
- Documented not-verified items (dark theme re-measure, "File a task" server round-trip, touch input) are reasonable; the round-trip is covered by component/API tests.

## Suggestions
- Add a unit case for the new "No check steps resolved for this repo." wording (zero steps, no errors, non-empty source) so the reworded line is pinned, not just the suppression.
- `first-run-interactions.mjs` selects the Copy button positionally (`.ncpr-btn` nth(1)); a `getByRole("button", { name: "Copy CLI hint" })` would survive button reordering.
- `measure-first-run-widths.mjs` collects link hrefs but the script never probes them for 404s (comment says "reported by the caller"); either wire the probe in or trim the comment.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T09:28:31.200Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

