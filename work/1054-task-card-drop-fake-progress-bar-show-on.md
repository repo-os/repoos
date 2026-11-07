---
id: 1054
title: "Task card: drop fake progress bar, show one checks status line"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-card-drop-fake-progress-bar-show-on
cli_override: cursor
model_override: composer-2.5
review_cli_override: codex
review_model_override: terra
created_at: "2026-11-07T13:16:10Z"
updated_at: "2026-11-07T17:21:48Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-07T17:21:16.921Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Pipeline card: thin bar under step label (target \"default\"): highlight [data-test-id=\"pipeline-card-check-progress\"] matched nothing on /work?tab=pipeline (http://127.0.0.1:52702/work?tab=pipeline&shotState=pipeline%3AchecksProgress)"
last_handoff_failure_fingerprint: check|server-side finalization timed out (deadline exceeded)
last_handoff_failure_sha: 327f82caba15ce9de2c59142031bfa31fec8684c
---
## Problem
After #1047, the Active task card is too busy while checks run, and the green bar is misleading. `checkProgressPercent()` (src/ui-app/src/lib/check-progress.ts) only returns a number when the server reports step counts or test-file counts. When a handoff reuses an earlier check ("reused check 14098") or is in a handoff stage with no counts (e.g. "Checking review"), the bar falls back to the generic sliding animation, which says nothing the old animation didn't. The same state is also shown three times on the card: the bottom "RUNNING CHECKS · CHECK · 41s" hint, the bar + "Checking review · attempt 13", and (in the drawer) a "Checks failed" box whose badge contradicts its "running checks" line.

## Desired UX
1. Bar: render a filled bar only when there is a real fraction (steps or tests). With no real fraction render NO bar, only a text label. Never show a decorative sliding bar.
2. One status per card: remove the duplication between the bottom `tc-reviewing` "running checks" hint and the bar+label. Keep a single line, e.g. `Checks · step 3 of 9 · 41s`, or `Checks · reused earlier result · 41s` for the reuse case, or `Checks · starting…`.
3. Attempt number and machine appear only in the drawer, not on the card.
4. Drawer: while a handoff/check is running, the status badge must not say CHECKS FAILED (show "Checking…" or dim the stale failure) so it never contradicts the running box.
5. Reused checks are labelled "reused earlier check"; no bar.

## Acceptance criteria
- TaskCard.vue: no `is-indeterminate`/`check-progress-indeterminate` bar; bar only when `cardCheckProgressPercent != null`.
- Only one running-checks line on the card; attempt/machine removed from the card.
- TaskDrawer badge does not read CHECKS FAILED while a handoff or check is in flight.
- Tests updated/added (active-task-card, task-panel-card-label-match, handoff-status as needed); `repoos check --changed main` passes; UI rebuilt.
- Declare 1–2 `## Shots` (card during a counted check, card during a reused check).

## Notes for AI
Context: filed from review of #1047 screenshots (task #1049 mid-handoff, attempt 13, reused check). Keep scope to removing/merging UI; do not change server progress reporting. Follow AGENTS.md conventions (no native title tooltips, global classes in style.css).

## Shots
```json
[
{
"label": "Board card: bar + tests 3/680 line, robot in header",
"target": "default",
"route": "/work?status=active",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-check-progress\"]",
"state": "card:checksProgress"
},
{
"label": "Board card: reused check, text only",
"target": "default",
"route": "/work?status=active",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-check-status-line\"]",
"state": "card:checksReuse"
},
{
"label": "Drawer: compact three-line checks box (counted)",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": "[data-test-id=\"close-out-check-progress\"]",
"state": "drawer:checksProgress"
},
{
"label": "Drawer: reused check, no bar",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": "[data-test-id=\"close-out-check-progress\"]",
"state": "drawer:checksReuse"
},
{
"label": "Pipeline card: thin bar under step label",
"target": "default",
"route": "/work?tab=pipeline",
"highlight": "[data-test-id=\"pipeline-card-check-progress\"]",
"state": "pipeline:checksProgress"
}
]
```

## Activity

- 2026-11-07T13:16:10Z · created · njachowski@gmail.com
- 2026-11-07T13:16:13Z · cli_override, model_override, review_cli_override, review_model_override
- 2026-11-07T13:16:19Z · status inbox→ready
- 2026-11-07T13:16:21Z · status ready→active, branch
- 2026-11-07T13:18:46Z · message_queued at 2026-11-07T13:18:46.576Z
- 2026-11-07T13:19:14Z · message_queued at 2026-11-07T13:19:14.390Z
- 2026-11-07T13:20:06Z · message_queued at 2026-11-07T13:20:06.057Z
- 2026-11-07T13:21:24Z · body
- 2026-11-07T13:21:24Z · message_queued at 2026-11-07T13:21:24.437Z
- 2026-11-07T13:23:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T13:29:52Z · message_queued at 2026-11-07T13:29:52.311Z
- 2026-11-07T13:48:21Z · body
- 2026-11-07T14:13:21Z · body
- 2026-11-07T14:18:47Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-07T14:18:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Implementing a shared checks status formatter and updating TaskCard, TaskDrawer, and tests. · stderr: (empty)
- 2026-11-07T14:18:48Z · message_delivered: 5 message(s)
- 2026-11-07T14:23:46Z · body
- 2026-11-07T14:33:42Z · message_queued at 2026-11-07T14:33:42.085Z
- 2026-11-07T14:33:42Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T14:38:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T15:02:11Z · body
- 2026-11-07T15:26:52Z · body
- 2026-11-07T15:33:56Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-07T15:33:57Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Implementing shared progress helpers, a reusable display component, and the driver’s UI/action changes. · stderr: (empty)
- 2026-11-07T15:33:57Z · message_delivered: 1 message(s)
- 2026-11-07T15:35:03Z · body
- 2026-11-07T15:36:23Z · CTO nudge: held — handoff gate is running
- 2026-11-07T15:39:10Z · message_queued at 2026-11-07T15:39:10.779Z
- 2026-11-07T15:39:13Z · message_delivered: 1 message(s)
- 2026-11-07T15:43:41Z · message_queued at 2026-11-07T15:43:41.739Z
- 2026-11-07T15:43:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T15:48:42Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T15:49:32Z · body
- 2026-11-07T16:02:04Z · message_queued at 2026-11-07T16:02:04.126Z
- 2026-11-07T16:04:50Z · body
- 2026-11-07T16:10:54Z · note: handoff requested (ui-review)
- 2026-11-07T16:13:41Z · CTO nudge: held — handoff gate is running
- 2026-11-07T16:22:49Z · body
- 2026-11-07T16:40:54Z · message_queued at 2026-11-07T16:40:54.859Z
- 2026-11-07T16:40:55Z · handoff failed · ui-review handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-11-07T16:41:16Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-07T16:41:17Z · message_queued at 2026-11-07T16:41:17.242Z
- 2026-11-07T16:41:17Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Handoff timed out during server finalization; re-requesting review. · stderr: (empty)
- 2026-11-07T16:41:17Z · message_delivered: 4 message(s)
- 2026-11-07T16:41:34Z · note: ui verification failed (1 issue(s)): [missing-target] Pipeline card: thin bar under step label (target "default"): highlight [data-test-id="pipeline-card-check-progress"] matched nothing on /work?tab=pipeline (http://127.0.0.1:64161/work?tab=pipeline&shotState=pipeline%3AchecksProgress)
- 2026-11-07T16:43:42Z · message_queued at 2026-11-07T16:43:42.129Z
- 2026-11-07T16:43:42Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T16:48:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T16:50:00Z · body
- 2026-11-07T16:53:42Z · CTO nudge: held — handoff gate is running
- 2026-11-07T17:21:13Z · note: ui verification failed (1 issue(s)): [missing-target] Pipeline card: thin bar under step label (target "default"): highlight [data-test-id="pipeline-card-check-progress"] matched nothing on /work?tab=pipeline (http://127.0.0.1:52702/work?tab=pipeline&shotState=pipeline%3AchecksProgress)
- 2026-11-07T17:21:13Z · message_queued at 2026-11-07T17:21:13.646Z
- 2026-11-07T17:21:16Z · message_delivered: 1 message(s)
- 2026-11-07T17:21:48Z · message_queued at 2026-11-07T17:21:48.934Z
