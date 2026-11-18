---
task: "1168"
pass: 1
at: "2026-11-18T01:07:30.079Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-exercise-the-new-releases-genera
state: ok
tree_identity: "67647b1fe:"
---
## Verdict
`needs some work` — the QA pass missed a visible copy defect in the modal it certified, so its "no defects" claim and acceptance criterion 3 are unmet.

## Relevance
`still relevant` — the #1126 chooser and #1154 restart notice are still on main, no QA record for either had landed, and the evidence confirms both are reachable.

## Evidence
None

## Bugs
- **Class: copy pluralization** — `src/ui-app/src/components/ReleaseUpdateNotification.vue:333-334` interpolates `{{ activeWork.agents }} agents` / `{{ activeWork.checks }} checks` unconditionally. With the restart fixture's `checks: 1` every capture reads "2 agents and 1 checks running" (and `agents: 1` would read "1 agents"). The QA pass inspected these same screenshots, reported "no product defects were found", and filed nothing, so its acceptance criterion "Record every defect; fix small clear ones with a test each" is not met. Pluralize both counts and add a test.
No further findings of this class were found after grepping: both activeWork interpolations in `ReleaseUpdateNotification.vue`, the `restartNoticeFetch` fixture and restart tests in `releases.test.ts`/`update-status.test.ts`, and the release banner fixtures.

## Edge cases
- The Desired UX says "a correct command otherwise", but launchd/systemd render no command (existing tests assert no `launchctl|systemctl`). The pass never resolves whether "otherwise" meant a visible command; the `uncertain` state, the only one that prints `restartCommand`, was not captured.
- The hand-run copy only says "recorded serve flags and port"; the actual flags/port are not shown, so "explains the recorded serve flags and port" overstates the capture.
- Only 1440px chooser shots exist; no 390px chooser capture.

## Suggestions
- Re-capture the six dark notice shots after waiting for theme/dialog transitions. They were taken mid-switch: no light pixel exists in the "Restart now" label region (max luminance ~74 vs ~244 in the settled earlier capture), so dark-mode readability was not actually verified. `chooser-notify.png` is likewise mid-animation (translucent modal, drawer text showing through).
- Attach the captures to the task (`repoos update 1168 --screenshot …`) — both local `.repoos` evidence dirs are gitignored, so the human cannot see them from the drawer. Reconcile them too: the final dir has no pending-Notify or `failed-draft.png` even though `flow.mjs` writes the latter, and the doc points at the older dir.
- Reconcile the record: doc says port 7278 / scratch worktree, report says 7371 / task worktree (captures' top bar shows the task worktree), and test counts are 39 vs 49+18.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

