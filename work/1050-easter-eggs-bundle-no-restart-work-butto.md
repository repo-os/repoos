---
id: 1050
title: "Easter eggs bundle: no Restart work button while checks run"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-no-restart-work-butto
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-11-07T07:03:41Z"
updated_at: "2026-11-07T21:16:57Z"
review_rounds: 1
routing_switches: 1
routing_escalations: 1
last_check_failure: "repoos check at 2026-11-07T19:43:41.770Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from 463a9738 to 831c9b03) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
review_passes: 1
engineer_stall_resume_log: "[{\"at\":\"2026-11-07T19:51:20.419Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-07T20:21:05.967Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Items
## Items

- [x] **E1 · No Restart work button while checks run** (web) — while a handoff or check is running for an active task, the card and drawer show no primary button (the "running checks" status already says it). Source: human report 2026-11-07 (screenshot of #1047's card).
- [x] **E2 · Close the Uncommitted changes panel after a successful commit** (web) — After a successful commit from the Uncommitted changes side panel (RepoDirtyPanel.vue commit()), close the panel. The success toast already reports the commit (files, branch, sha), and the panel otherwise stays open reading "Uncommitted changes · Working tree is clean." with the "Committed 1 file to main (96d818687)." note, which is odd. Remove the now-redundant in-panel committedNote or keep it only if the panel stays open. Keep the panel open on failure (error and hook output stay visible). If the commit leaves other files uncommitted (dirtyCount > 0 after refresh) decide explicitly: close anyway, since the toast reports what happened. Source: human report 2026-11-07 (screenshot of the panel after a commit).
- [x] **E3 · Collapse repeated agent stderr lines in the chat and stop styling them as errors** (web) — In the task drawer's Dev chat, identical consecutive stderr lines from the agent CLI are collapsed into one neutral expandable entry with a count and first/last time. Source: human report 2026-11-07 (screenshot of #1047's Dev chat full of red Error cards).

## E1 · No Restart work button while checks run

### Problem
An `active` task whose engineer has exited and whose server-side handoff or check is running shows "RUNNING CHECKS" as its status but "Restart work" as its main button (seen on #1047 on 2026-11-07). `TaskCard.vue` (the `action` computed, `t.status === "active"`) chooses Pause or Restart only from `repo.isRunning(t.id)` (is an engineer agent process running), which is a different signal from the "running checks" hint. The drawer has the same pattern: the `task-drawer-start-work` button shows "Restart work" for an active task when `!repo.isRunning(...)`. Clicking it mid-check could start a second engineer on a branch that is being verified.

### Desired UX
- While a handoff or check is running for the task (any step: commit, check, verify, review), the card shows NO primary action button, and the drawer hides "Restart work" (and the request-review button, which has the same gap if it is not already gated on `handoffBusy`). The "running checks · <step>" status already carries the information, so a disabled or duplicate button would only repeat it.
- When the handoff ends (passed, failed or cancelled) the normal buttons come back: Restart work if no engineer is running, Pause work if one is.
- Tasks with no handoff running are unchanged.
- Use the same "handoff running" signal the "running checks" hint uses, so the button and the status can never disagree. If #1047 (task card and panel show running checks clearly) has landed, reuse its server-backed handoff-status source, so this also holds after a reload and for CLI-requested handoffs.

### Acceptance criteria
- Test: an `active` task with a running handoff and no running engineer renders no primary action button on the card, and no Restart work or Start work button in the drawer.
- Test: the same task after the handoff ends (passed and failed) renders Restart work again.
- Test: an `active` task with a running engineer still renders Pause work, and one with neither shows Restart work.
- Test: the card's status text and its button visibility are derived from the same handoff-running value (one shared helper or computed).

### Notes for AI
Start from the `action` computed in `src/ui-app/src/components/TaskCard.vue` (about line 1126, `ACTIVE_PAUSE` / `ACTIVE_RESTART`) and the `task-drawer-start-work` and `task-drawer-request-review` buttons in `src/ui-app/src/components/TaskDrawer.vue` (about line 5430). Depends on #1047 landing first so the handoff-running signal is the server-backed one; do not duplicate its logic. Source: human report 2026-11-07.


## E2 · Close the Uncommitted changes panel after a successful commit

### Problem


### Desired UX


### Acceptance criteria

- Test: Component test: a successful commit closes the panel and shows the success toast; a failed commit keeps it open with the error and hook output; a commit that leaves the tree clean does not leave the 'Working tree is clean' state visible.

### Notes for AI


## E3 · Collapse repeated agent stderr lines in the chat and stop styling them as errors

### Problem


### Desired UX


### Acceptance criteria

- Test: Component test: 21 identical stderr events render as one entry with a x21 count and an expandable detail; a different stderr line breaks the run; a stderr line is not styled as an error while the agent keeps producing normal messages, but a real turn failure still renders as an error; the count updates as new identical lines arrive.

### Notes for AI

## Shots
```json
[
{
"label": "Task drawer while checks run",
"target": "default",
"route": "/work?task=1050&tab=dev",
"highlight": ".drawer-quickbar",
"state": "drawer:statusChecksRunning"
}
]
```

## Activity

- 2026-11-07T07:03:41Z · created · njachowski@gmail.com
- 2026-11-07T07:03:45Z · depends_on
- 2026-11-07T07:23:43Z · held, held-reason, held-at
- 2026-11-07T07:57:46Z · body: Items (added 1); E2 · Close the Uncommitted changes panel after a successful commit (added)
- 2026-11-07T07:57:46Z · note: bundle add E2
- 2026-11-07T11:02:36Z · body: Items (added 1); E3 · Collapse repeated agent stderr lines in the chat and stop styling them as errors (added)
- 2026-11-07T11:02:36Z · note: bundle add E3
- 2026-11-07T13:13:42Z · needs_input
- 2026-11-07T13:20:01Z · body: Items (added 1, removed 1)
- 2026-11-07T13:20:01Z · note: bundle done E1
- 2026-11-07T13:57:20Z · status inbox→ready
- 2026-11-07T16:01:49Z · released
- 2026-11-07T16:01:51Z · status ready→active, needs_input, branch
- 2026-11-07T16:14:16Z · body
- 2026-11-07T16:17:51Z · body
- 2026-11-07T16:22:33Z · body: Items (added 2, removed 3)
- 2026-11-07T16:22:33Z · message_queued at 2026-11-07T16:22:33.621Z
- 2026-11-07T16:23:07Z · body
- 2026-11-07T16:23:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T16:27:16Z · body
- 2026-11-07T16:31:01Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-07T16:31:01Z · message_queued at 2026-11-07T16:31:01.403Z
- 2026-11-07T16:31:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: no assistant message · stderr: Reading additional input from stdin... 2026-11-07T16:23:37.825953Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/easter-eggs-bundle-no-restart-work-butto/src/ui-app/src/components/ChatDiagnosticRow.vue: <pre class="a…
- 2026-11-07T16:34:16Z · message_delivered: 2 message(s)
- 2026-11-07T16:38:42Z · CTO nudge: held — handoff gate is running
- 2026-11-07T17:04:24Z · note: ui verification failed (2 issue(s)): [missing-target] Task drawer while checks run (target "default"): state "drawer:statusChecksRunning" did not render on target "default" — /work?task=1050 has no open drawer/dialog (declare the route that opens it, e.g. /work?task=9999&tab=changes) (http://127.0.0.1:50591/work?task=1050&shotState=drawer%3AstatusChecksRunning); [missing-target] Task drawer while checks run (target "default"): highlight .drawer-quickbar matched nothing on /work?task=1050 (http:/
- 2026-11-07T17:04:25Z · message_queued at 2026-11-07T17:04:25.003Z
- 2026-11-07T17:04:28Z · message_delivered: 1 message(s)
- 2026-11-07T17:04:59Z · body
- 2026-11-07T17:11:27Z · body
- 2026-11-07T17:11:52Z · engineer stopped by request
- 2026-11-07T17:32:38Z · body
- 2026-11-07T17:36:04Z · body
- 2026-11-07T17:43:41Z · CTO nudge: held — handoff gate is running
- 2026-11-07T18:09:26Z · message_queued at 2026-11-07T18:09:26.417Z
- 2026-11-07T18:10:09Z · status active→review
- 2026-11-07T18:10:09Z · note: Task body is underspecified: E2: empty Problem, Desired UX, Notes for AI; E3: empty Problem, Desired UX, Notes for AI
- 2026-11-07T18:10:09Z · note: handoff requested (cli)
- 2026-11-07T18:14:00Z · message_delivered: 1 message(s)
- 2026-11-07T18:21:50Z · body
- 2026-11-07T18:26:37Z · handoff failed · task-file handoff failed at verify · ui verification failed: timed out waiting for the task's browser capture
- 2026-11-07T18:31:09Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (463a9738c) during finalization (#0734)
- 2026-11-07T18:55:08Z · note: ui verification failed (1 issue(s)): [missing-target] Task drawer while checks run (target "default"): highlight [data-test-id="task-drawer-start-work"] matched nothing on /work?task=1050&tab=dev (http://127.0.0.1:64307/work?shotState=drawer:statusChecksRunning)
- 2026-11-07T18:55:09Z · message_queued at 2026-11-07T18:55:09.036Z
- 2026-11-07T18:55:12Z · message_delivered: 1 message(s)
- 2026-11-07T18:55:54Z · body
- 2026-11-07T18:58:15Z · body
- 2026-11-07T19:01:53Z · review_cli_override, review_model_override
- 2026-11-07T19:03:41Z · CTO nudge: held — handoff gate is running
- 2026-11-07T19:18:31Z · message_queued at 2026-11-07T19:18:31.386Z
- 2026-11-07T19:18:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T19:21:51Z · message_delivered: 1 message(s)
- 2026-11-07T19:26:42Z · body
- 2026-11-07T19:29:42Z · status active→review
- 2026-11-07T19:30:43Z · note: review pass 1: needs some work
- 2026-11-07T19:30:45Z · message_queued at 2026-11-07T19:30:45.933Z
- 2026-11-07T19:30:46Z · status review→active
- 2026-11-07T19:30:48Z · CTO nudge: held — handoff gate is running
- 2026-11-07T19:43:38Z · message_queued at 2026-11-07T19:43:38.358Z
- 2026-11-07T19:43:41Z · message_delivered: 2 message(s)
- 2026-11-07T19:46:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The merge preflight confirmed the conflicts are real. `main` changes both components, so I started a merge and resolved the component conflicts while keeping both sides’ behavior. I then aborted that merge because completing it requires st… · stderr: 2026-11-07T19:43:43.824843Z ERROR codex_core::util: Custom tool call output is missing for call id: call_1bd6792c07774038b622919b6f73da0b 2026-11-07T19:43:57.369854Z ERROR codex_core::util: Custom tool call output is missing for call id: call_1bd6792c07774038b622919b6f73da0b
- 2026-11-07T19:51:20Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-07T19:51:32Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (831c9b037) during finalization (#0734)
- 2026-11-07T20:15:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The implementation is reconciled with `main`, and the final `REPOOS_CHECK_CHANGED=main repoos check` passed. The focused card-action tests and UI smoke test passed as well. I updated the engineering report draft at [.repoos/engineering-rep… · stderr: Reading additional input from stdin... 2026-11-07T20:15:04.863482Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 18643
- 2026-11-07T20:21:05Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-07T20:38:42Z · message_queued at 2026-11-07T20:38:42.013Z
- 2026-11-07T20:38:42Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T20:43:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T21:02:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The three UI changes and their tests are present in the current merge result. The final `REPOOS_CHECK_CHANGED=main repoos check` passed: all 367 test files passed, with 5,028 tests passed and one skipped; the build, contrast audit, and UI … · stderr: Reading additional input from stdin... 2026-11-07T21:01:35.994797Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 20737
- 2026-11-07T21:02:34Z · message_delivered: 1 message(s)
- 2026-11-07T21:02:43Z · message_queued at 2026-11-07T21:02:43.842Z
- 2026-11-07T21:02:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T21:03:08Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I can’t safely hand this off yet. The branch still conflicts with `main` in `TaskCard.vue` and `TaskDrawer.vue`. `repoos sync 1050` refuses while this agent turn is active, and the task instructions prohibit manually staging or committing … · stderr: 2026-11-07T21:01:35.994797Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 20737
- 2026-11-07T21:03:08Z · status active→review
- 2026-11-07T21:03:08Z · message_delivered: 1 message(s)
- 2026-11-07T21:03:09Z · note: handoff requested (cli)
- 2026-11-07T21:03:31Z · status active→review
- 2026-11-07T21:03:33Z · message_queued at 2026-11-07T21:03:33.563Z
- 2026-11-07T21:03:33Z · status review→active
- 2026-11-07T21:03:36Z · CTO nudge: held — handoff gate is running
- 2026-11-07T21:16:56Z · message_queued at 2026-11-07T21:16:56.883Z
- 2026-11-07T21:16:57Z · handoff failed · task-file handoff failed at verify · ui verification failed: timed out waiting for the task's browser capture
