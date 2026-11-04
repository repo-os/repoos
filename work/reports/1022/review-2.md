---
task: 1022
pass: 2
at: "2026-11-04T20:29:35.213Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/macos-hub-ci-hubfindbarcontainertests-te
state: ok
tree_identity: "cc7e9856e:"
---
## Verdict
`good to go` — no blocking code defects; pass 1's false-pass assertion is fixed and CI confirmation is inherently post-merge.

## Relevance
`still relevant` — all eight macOS Hub runs since 2026-10-19 fail (`gh run list`), and no other task or commit on `main` fixes this test.

## Evidence
None

## Bugs
None found

## Edge cases
- Acceptance criterion "workflow passes on a push to main" is still unverified: the branch has no `pull_request`/dispatch run, so the next proof is the merge. The 04:09 xcresult here shows the new test passing (0.598 s), but no retained xcresult contains the `XTMemoryChecker` crash named in the doc, so that root cause rests on the round-2 report. If the crash has another cause, `main` could stay red.
- The new pre-hide `findBarOwnsFocus` assertion requires AppKit to install the field editor (or leave the search field as first responder) on the runner. The old strict post-hide assertion was never seen passing on CI (the run crashed), so this is only locally proven.
- Polling uses `DispatchQueue.main.async` draining via `RunLoop.main.run(until:)`; correct on the main actor, but the 1 s budget is untested on a loaded runner.
- The test now emits two `Conflicting constraints` runtime warnings (hidden find bar laid out at height 0). They don't fail the job today but add noise to an otherwise green run.

## Suggestions
- Drop the two constraint warnings in the passing 04:09 xcresult: `settleFocusWindow` forces `window.layoutIfNeeded()` while `HubFindBarView` is hidden at zero height, breaking the button height constraint. Size the bar (or settle only after `presentFindInterface`) instead.
- Round-2's precedent claim is off: `HubWorkspaceChromeTests` only sets `isReleasedWhenClosed = false`; nil-ing `contentView` and draining the loop before close is `HubSnapshotSupport`'s pattern (which the new test actually follows). The doc wording itself is accurate.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

