---
id: 1047
title: "Task card and panel: show running checks clearly, with a live progress bar"
type: bug
status: review
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-card-and-panel-show-running-checks-
cli_override: codex
model_override: gpt-6-luna
review_model_override: default
created_at: "2026-11-07T00:21:00Z"
updated_at: "2026-11-07T11:44:13Z"
last_check_failure: "repoos check at 2026-11-07T10:47:14.656Z: repoos check failed: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:65527/api/tasks/1047/integration-job (http://127.0.0.1:65527/api/tasks/1047/integration-job); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:65527/api/tasks/1047/integration-job)"
review_passes: 3
review_rounds: 2
incomplete_review_retries: 1
---
## Problem

While the server runs a task's handoff checks, the card and drawer can show "paused" (card) or "stuck · silent 7m" and "Quiet — may be stalled" (drawer), although the checks are running. Seen on #1046 on 2026-11-07: `repoos handoff-status 1046` said `running` at step `check`, the Checks page showed Slot 0 held by #1046 (PID 20002 alive, heartbeat 2s ago, held 8 minutes), and the chat itself said "Verifying the worktree and running repoos check". The same happened to #1041 earlier. Screenshots 1 (drawer) and 2 (Checks page) are attached.

Cause found: `handoffInFlight(id)` in `src/ui-app/src/stores/repo.ts` (about line 1407) is true only when the page received a live `handoff:*` SSE step, or when the hydrated check history has a running `handoff-finalize` run. For #1046 `GET /api/tasks/1046/checks` returned `runs: []` while the server's handoff status was `running`, and the handoff had been requested from the CLI, so a page opened or reloaded afterwards never learns about it. `TaskCard.vue` then falls through to "paused" (agent stopped), and the drawer's auto-repair hint reads the agent's silence as "stuck".

## Desired UX

- While any handoff or check is running for the task, the card says "running checks" and the drawer says the same, with the step (commit, check, verify, review) and how long it has run. The stuck and quiet banners are suppressed while the server owns the task.
- This holds after a reload, on a second device, and for handoffs requested from the CLI.
- If the check run list is empty but a local check slot is held by this task, that also counts as running.

## Acceptance criteria

- The task card and drawer read the server's own handoff status (the source `repoos handoff-status` uses, `readHandoffStatus` in `src/server/handoff-status.ts`) or an equivalent field in the task payload or SSE snapshot, not only live events and the check-run list.
- A task in `active` with a running handoff shows "running checks · <step>" on the card and in the drawer after a page reload, with no live SSE event.
- The drawer's "stuck · silent" and "Quiet — may be stalled" banners do not show while a handoff is running.
- Find out why `runs` was empty during a server-side check, and either record the run or document why not (see the run start in `src/server/handoff.ts` around line 780).
- Tests cover a reload during a CLI-requested handoff.

## Notes for AI

Start from `TaskCard.vue` (the active branch of the status hint, about lines 985-1050, and the onMounted hydration), `stores/repo.ts` (`handoffInFlight`, `handoffSteps`, `refreshTaskChecks`) and the auto-repair hint code that produces "stuck · silent". Prefer polling or snapshotting the existing handoff status over adding a new store.

## Progress bar (bring it back)
The task panel used to show a realtime progress bar for checks and tests. It still exists in code but is switched off: `TaskDrawer.vue` has the block `v-if="false && inPipeline && activeCheckRun"` (data-test-id `close-out-check-progress`, a `<progress>` plus `checkProgressLabel`), disabled by #0952 on 2026-10-25 when the status card was redesigned, and it was only ever placed in the review and close-out button area.

Wanted: a progress bar in the task panel status card above the tabs, visible whenever a handoff, check or close-out gate is running for the task:
- Percent from steps done over total (`checkProgressPercent`), with the label from `checkProgressLabel` (e.g. "step 5 of 12 · tests 140/289 files") and the current step name; when totals are unknown show the step count without inventing a percent.
- Test progress (files done over total) while the tests step runs, driven by the `::repoos-check-progress::` markers the check already emits (`stepsDone`, `stepsTotal`, `currentStep`, `stepName`, `testsDone`, `testsTotal`) and parsed in `stores/repo.ts` (~line 2062).
- It must work after a reload and for CLI-requested and server-side runs, so the progress has to come from the server's handoff status or a snapshot field, not only from the in-memory `repo.taskChecks` list (which was empty for #1046's server-side check). Include progress in the handoff status the card reads.
- The task card gets a thin version of the same bar.
- Also show attempt number and which machine runs it, as the old block did.
- Accessible: `role="progressbar"` with values, or the native `<progress>`, readable and not colour-only.

Acceptance: a task whose handoff checks run shows the bar in the panel above the tabs and on the card, advancing as steps and test files complete, after a reload; a test covers percent, unknown totals and the reload case; a declared shot (fixture `shot-check-progress` already exists in `shot-preview-fixtures.ts`) shows the bar.

## Shots
```json
[
{
"label": "Task drawer showing live check progress, attempt and machine",
"target": "default",
"route": "/work?task=1047&tab=changes",
"highlight": "[data-test-id=\"close-out-check-progress\"]",
"state": "closeOut:checkProgress"
}
]
```

## Screenshots

![11](/api/tasks/1047/attachments/att_d53d06e7-472f-4f22-8ab7-98a6aebeaed6.png)
![12](/api/tasks/1047/attachments/att_318f0283-0172-40bd-bea6-2c868fffe8c0.webp)

## Activity

- 2026-11-07T00:21:00Z · created · njachowski@gmail.com
- 2026-11-07T00:21:00Z · screenshots
- 2026-11-07T00:29:44Z · title, body: Progress bar (bring it back) (added)
- 2026-11-07T00:49:51Z · cli_override, model_override
- 2026-11-07T00:49:52Z · model_override
- 2026-11-07T00:49:57Z · review_cli_override
- 2026-11-07T00:49:57Z · review_model_override
- 2026-11-07T00:50:01Z · status inbox→ready
- 2026-11-07T00:50:03Z · status ready→active, branch
- 2026-11-07T00:57:04Z · body
- 2026-11-07T01:34:18Z · body
- 2026-11-07T01:37:50Z · CTO nudge: held — handoff gate is running
- 2026-11-07T01:56:16Z · note: ui verification failed (1 issue(s)): [missing-target] Task panel check progress bar (target "default"): highlight [data-test-id="close-out-check-progress"] matched nothing on /work (http://127.0.0.1:55797/work?shotState=closeOut%3AcheckProgress)
- 2026-11-07T01:56:16Z · message_queued at 2026-11-07T01:56:16.752Z
- 2026-11-07T01:56:19Z · message_delivered: 1 message(s)
- 2026-11-07T01:57:07Z · body
- 2026-11-07T02:27:50Z · CTO nudge: held — handoff gate is running
- 2026-11-07T02:44:03Z · CTO nudge: held — handoff gate is running
- 2026-11-07T03:09:05Z · message_queued at 2026-11-07T03:09:05.097Z
- 2026-11-07T03:09:05Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-07T03:09:07Z · message_delivered: 1 message(s)
- 2026-11-07T03:11:39Z · note: ui verification failed (14 issue(s)): [request] HTTP 404 for http://127.0.0.1:51952/api/tasks/9999/handoff-status (http://127.0.0.1:51952/api/tasks/9999/handoff-status); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:51952/api/tasks/9999/handoff-status); [request] HTTP 404 for http://127.0.0.1:51952/api/tasks/9999/summary (http://127.0.0.1:51952/api/tasks/9999/summary); [request] Failed to load resource: the server responded with a stat
- 2026-11-07T03:23:25Z · body
- 2026-11-07T03:29:03Z · CTO nudge: held — handoff gate is running
- 2026-11-07T03:51:54Z · note: ui verification failed (14 issue(s)): [request] HTTP 404 for http://127.0.0.1:54780/api/tasks/9999/handoff-status (http://127.0.0.1:54780/api/tasks/9999/handoff-status); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:54780/api/tasks/9999/handoff-status); [request] HTTP 404 for http://127.0.0.1:54780/api/tasks/9999/summary (http://127.0.0.1:54780/api/tasks/9999/summary); [request] Failed to load resource: the server responded with a stat
- 2026-11-07T03:51:54Z · message_queued at 2026-11-07T03:51:54.881Z
- 2026-11-07T03:51:57Z · message_delivered: 1 message(s)
- 2026-11-07T04:08:06Z · body
- 2026-11-07T04:21:34Z · body
- 2026-11-07T04:29:03Z · CTO nudge: held — handoff gate is running
- 2026-11-07T04:48:29Z · status active→review
- 2026-11-07T04:48:29Z · message_queued at 2026-11-07T04:48:29.924Z
- 2026-11-07T04:49:46Z · note: review pass 1: needs some work
- 2026-11-07T04:49:47Z · message_delivered: 1 message(s)
- 2026-11-07T04:49:47Z · status review→active
- 2026-11-07T04:49:49Z · CTO nudge: held — remote validation is running
- 2026-11-07T04:57:34Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (13c13753c) during finalization (#0734)
- 2026-11-07T05:04:03Z · message_queued at 2026-11-07T05:04:03.416Z
- 2026-11-07T05:04:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T05:09:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T05:18:06Z · body
- 2026-11-07T05:36:19Z · CTO nudge: held — handoff gate is running
- 2026-11-07T05:54:41Z · status active→review
- 2026-11-07T05:54:42Z · message_queued at 2026-11-07T05:54:42.260Z
- 2026-11-07T05:56:52Z · note: review pass 2: needs some work
- 2026-11-07T05:56:52Z · message_delivered: 1 message(s)
- 2026-11-07T05:56:53Z · status review→active
- 2026-11-07T05:56:56Z · CTO nudge: held — remote validation is running
- 2026-11-07T06:42:27Z · body
- 2026-11-07T06:46:19Z · CTO nudge: held — handoff gate is running
- 2026-11-07T07:12:03Z · status active→review
- 2026-11-07T07:12:04Z · message_queued at 2026-11-07T07:12:04.116Z
- 2026-11-07T07:13:48Z · note: review pass 3: needs some work
- 2026-11-07T07:13:48Z · needs_input
- 2026-11-07T07:21:12Z · status review→active
- 2026-11-07T07:21:12Z · note: send-back — returned to active for engineer follow-up
- 2026-11-07T07:21:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T07:31:16Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-07T07:31:19Z · message_delivered: 1 message(s)
- 2026-11-07T07:31:20Z · CTO nudge: held — remote validation is running
- 2026-11-07T07:32:01Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (01003f662) during finalization (#0734)
- 2026-11-07T07:32:12Z · message_queued at 2026-11-07T07:32:12.498Z
- 2026-11-07T07:32:40Z · message_queued at 2026-11-07T07:32:40.539Z
- 2026-11-07T07:33:04Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T07:33:04Z · body
- 2026-11-07T07:51:35Z · body
- 2026-11-07T08:00:54Z · body
- 2026-11-07T08:03:32Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-07T08:03:32Z · message_queued at 2026-11-07T08:03:32.980Z
- 2026-11-07T08:03:33Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The formatted rerun is now green for build, formatting, lint, all 364 scoped test files (5,007 passed, 1 skipped), and rendered contrast on both the remote and local guard paths. RepoOS is completing its local UI smoke check now. · stderr: Reading additional input from stdin...
- 2026-11-07T08:03:33Z · status active→review
- 2026-11-07T08:03:33Z · message_delivered: 3 message(s)
- 2026-11-07T08:03:34Z · note: handoff requested (cli)
- 2026-11-07T08:06:20Z · CTO nudge: held — handoff gate is running
- 2026-11-07T08:15:44Z · message_queued at 2026-11-07T08:15:44.688Z
- 2026-11-07T08:15:44Z · handoff failed · task-file handoff failed at check · the worktree changed while the gate was running (HEAD moved from 5d7d4bce to a86da372) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-11-07T08:16:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T08:32:21Z · body
- 2026-11-07T08:36:36Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-07T08:36:37Z · message_queued at 2026-11-07T08:36:37.066Z
- 2026-11-07T08:36:37Z · message_delivered: 2 message(s)
- 2026-11-07T08:41:20Z · message_queued at 2026-11-07T08:41:20.196Z
- 2026-11-07T08:41:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T08:46:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T08:48:28Z · body
- 2026-11-07T08:51:20Z · CTO nudge: held — handoff gate is running
- 2026-11-07T09:05:55Z · note: ui verification failed (1 issue(s)): [missing-target] Task drawer showing live check progress, attempt and machine (target "default"): highlight [data-test-id="close-out-check-progress"] matched nothing on /work?task=1047&tab=changes (http://127.0.0.1:52490/work?shotState=closeOut:checkProgress)
- 2026-11-07T09:05:56Z · message_queued at 2026-11-07T09:05:56.167Z
- 2026-11-07T09:05:59Z · message_delivered: 1 message(s)
- 2026-11-07T09:06:38Z · message_queued at 2026-11-07T09:06:38.487Z
- 2026-11-07T09:06:44Z · message_queued at 2026-11-07T09:06:44.324Z
- 2026-11-07T09:07:10Z · body
- 2026-11-07T09:11:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T09:23:39Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-07T09:23:39Z · message_queued at 2026-11-07T09:23:39.523Z
- 2026-11-07T09:23:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: `repoos check` finished green: all 680 test files passed, UI smoke passed, and the remaining docs/landing/Telegram checks passed. I’ve corrected the screenshot to use the fixture’s `9999` task route, so I’m re-requesting review now. · stderr: (empty)
- 2026-11-07T09:23:39Z · message_delivered: 3 message(s)
- 2026-11-07T09:26:20Z · message_queued at 2026-11-07T09:26:20.237Z
- 2026-11-07T09:26:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T09:30:18Z · body
- 2026-11-07T09:30:45Z · body
- 2026-11-07T09:31:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T10:26:20Z · message_overdue: still queued after 60m without being delivered
- 2026-11-07T10:27:38Z · queued message undelivered for 61m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-07T10:27:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: I found the two failures: the only named failing case was an existing timing-sensitive handoff test (“ignores a marker left behind by an earlier turn”), which failed in the full suite and then passed on retry in the focused run; the focuse… · stderr: 2026-11-07T09:50:51.105241Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out 2026-11-07T09:55:26.122075Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out 2026-11-07T10:00:01.136568Z ERROR codex_models_manager::manager: failed to refres…
- 2026-11-07T10:27:39Z · message_delivered: 1 message(s)
- 2026-11-07T10:31:20Z · message_queued at 2026-11-07T10:31:20.905Z
- 2026-11-07T10:31:21Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T10:36:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T10:37:22Z · body
- 2026-11-07T10:46:20Z · CTO nudge: held — handoff gate is running
- 2026-11-07T10:47:11Z · note: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:65527/api/tasks/1047/integration-job (http://127.0.0.1:65527/api/tasks/1047/integration-job); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:65527/api/tasks/1047/integration-job)
- 2026-11-07T10:47:11Z · message_queued at 2026-11-07T10:47:11.290Z
- 2026-11-07T10:47:14Z · message_delivered: 1 message(s)
- 2026-11-07T10:57:42Z · body
- 2026-11-07T11:06:20Z · CTO nudge: held — handoff gate is running
- 2026-11-07T11:24:28Z · status active→review
- 2026-11-07T11:24:28Z · message_queued at 2026-11-07T11:24:28.834Z
- 2026-11-07T11:25:56Z · note: review pass 4: incomplete — no verdict in report
- 2026-11-07T11:27:31Z · note: review pass 5: incomplete — no verdict in report
- 2026-11-07T11:44:13Z · review_cli_override, review_model_override
