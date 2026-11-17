---
task: "1163"
pass: 1
at: "2026-11-17T20:23:49.052Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/investigate-checks-tab-browser-pass-stal
state: ok
tree_identity: "d0c6d5f3f:"
---
## Verdict
`needs some work` — ChecksView never clears its 5 s local-slot poll on unmount; the new test doesn't cover that teardown.

## Relevance
`still relevant` — the Checks stall was never attributed; a click-through guard is worth keeping, and the live width pass is still open.

## Evidence
None — tests-only diff, so the `shots: skipped` note is correct.

## Bugs
- **Class: lifecycle/teardown ordering** — `src/ui-app/src/views/ChecksView.vue:171-176` (pre-existing on main) starts `window.setInterval(loadLocalSlotHolders, 5000)` in `onMounted` and never stores or clears it. The sibling `activeCheckPoll` (line 132) is cleared in `onBeforeUnmount` (137-139), and `RemoteRunnersPanel`, `TestRunPanel` and `IntegrationPipelineSummary` all clear theirs. Each mount leaves a permanent 5 s request to `/api/local-check-slots` and retains the unmounted component, so repeated SPA navigation accumulates polls — the app-side accumulation a repeated interaction pass would expose. The new test calls `wrapper.unmount()` but does not assert timer cleanup, so the "no app fault" conclusion leaves this real teardown defect unaddressed.

No further findings of this class were found after grepping: `ChecksView.vue` (both polls), `RemoteRunnersPanel.vue`, `TestRunPanel.vue`, `IntegrationPipelineSummary.vue`, `CheckRunsPanel.vue`, `DeploymentsView.vue`, `DevView.vue`, `ReleasesView.vue`, `LoginView.vue`, and the test's mount/unmount path.

## Edge cases
- The acceptance criteria ask for Now, Runs, Test suite and Check plan at 1440, 390 and 320 in both themes; only component routing was exercised. Live layout/responsiveness remains unverified.
- The harness stall was not attributed: the report establishes "no app fault reproduced", not "the capture harness caused it".
- Source merges cleanly; only this task's own `work/1163-*.md` conflicts, which close-out resolves from main.
- I ran the focused test file: 12 passed, so the new assertion is sound.

## Suggestions
- Store the interval id and clear it in `onBeforeUnmount`, with a fake-timer unmount regression test; or file a separate follow-up if the human wants this task test-only.
- Use `expect(control, `${label} tab`).toBeTruthy()` so a missing tab names itself.
- Record the conclusion in the task body or `docs/` so it is discoverable beyond `work/reports/`.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

