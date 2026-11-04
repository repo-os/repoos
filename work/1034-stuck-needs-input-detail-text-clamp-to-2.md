---
id: 1034
title: "Stuck/needs-input detail text: clamp to 2-3 lines on card and task panel, click opens Debug tab"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stuck-needs-input-detail-text-clamp-to-2
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
review_cli_override: opencode
review_model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-04T14:10:23Z"
updated_at: "2026-11-04T18:05:51Z"
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: tests/task-card-review-rounds-detail.test.ts > review-rounds-exhausted card detail (#0832) > clamps long detail and does not repeat the verdict under the status chip, tests/task-check-wait-detail-clamp.test.ts > check-wait diagnostic clamp (#1034) > clamps the card detail line and keeps the full text in Status details, tests/task-drawer-status-summary.test.ts > task drawer status summary (#0952) > keeps the landable checklist off the card and opens Status details on thinkpad — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: 67af7b1c6e38ccc66c4431bd32a61b4582e8b945
review_rounds: 2
review_passes: 2
last_check_failure: "repoos check at 2026-11-04T16:59:01.799Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Board card clamps long check-wait detail (target \"default\"): state \"card:checkWaitDetail\" did not render on target \"default\" — / shows no task card (http://127.0.0.1:60707/?shotState=card%3AcheckWaitDetail); [missing-target] Board card clamps long check-wait detail (target \"default\"): highlight [data-test-id=task-card-needs-input-detail] matched nothing on / (http://127.0.0.1:60707/?shotState=card%3AcheckWaitDetail)"
dev_error_count: 5
---
## Problem

When a task is stuck or waiting (needs input, 'STUCK · SILENT 16M', check-wait escalations), the board card and the task panel's WAITING FOR YOU block print the whole diagnostic string. For a check-slot wait it is 6+ wrapped lines of pids and queue positions (e.g. 'waiting for a local check slot (3 ahead, position 4); waiting behind #1030 check (pid 50649, alive), #1024 check (pid 70210, alive), ...'), which makes the card tall, pushes the other cards down and buries the action button. The agreed design was 2-3 lines of info on a card; the panel already truncates with an ellipsis after ~2 lines but still shows too much and the card does not truncate at all. See attached screenshots (#1030 and #1024 cards, #1030 panel).

## Desired UX

- Board card: the stuck/needs-input explanation is clamped to at most 3 lines (CSS line-clamp, ellipsis), card height stays predictable.
- Task panel WAITING FOR YOU / stuck block: same clamp (2-3 lines).
- Clicking the clamped text (or a small 'Details' affordance) opens the task panel on the Debug tab (Status details) where the full, unclamped text is shown. The control must be keyboard-focusable and work on touch; no native title tooltip.
- Primary action button (Restart work / Pause work) stays visible on the card.

## Acceptance criteria

1. Test: a long wait message renders clamped on the card and in the panel (class/attribute assertion), and the full text is present in the Debug tab Status details.
2. Test: clicking the clamped text on a card opens the task panel with tab=debug.
3. No bespoke colors; contrast audit and hardcoded-colors guard pass in light and dark.
4. Declared `## Shots`: a card and the panel with a long check-wait message.

## Notes for AI

Source of the strings is the check-wait/queue-marker message and the stuck-card state in src/core/active-task-card.ts; the panel block is the 'Waiting for you' component in the task drawer. Reuse the existing `?tab=debug` route handling (/work?task=<id>&tab=debug). Related: #0272 (card error UX). Observation, not in scope: these cards also say 'slot holder has made no progress for 30 minutes (no heartbeat)' and '#1024 check (pid 57029, wedged)' for live holders — that false alarm is #1032.

## Shots
```json
[
{
"label": "Board card clamps long check-wait detail",
"target": "default",
"route": "/work?status=active",
"highlight": "[data-test-id=task-card-needs-input-detail]",
"steps": [
{
"waitFor": "[data-test-id=task-card-needs-input-detail]"
}
],
"state": "card:checkWaitDetail"
},
{
"label": "Drawer waiting block clamps long check-wait detail",
"target": "default",
"route": "/work?task=9999",
"highlight": "[data-test-id=drawer-needs-input-detail]",
"state": "drawer:checkWaitDetail"
}
]
```

## Screenshots

![6](/api/tasks/1034/attachments/att_2364700c-13b6-4d61-bae3-26951e1331f9.png)
![7](/api/tasks/1034/attachments/att_2b28ec2f-cbb2-4e29-bb45-ba83d5e3099c.png)

## Activity

- 2026-11-04T14:10:23Z · created · njachowski@gmail.com
- 2026-11-04T14:10:23Z · screenshots
- 2026-11-04T14:11:24Z · cli_override
- 2026-11-04T14:11:25Z · model_override
- 2026-11-04T14:11:31Z · review_cli_override
- 2026-11-04T14:11:33Z · review_model_override
- 2026-11-04T14:11:34Z · status inbox→ready
- 2026-11-04T14:11:38Z · status ready→active, branch
- 2026-11-04T14:14:41Z · body
- 2026-11-04T14:15:26Z · body
- 2026-11-04T14:21:12Z · message_queued at 2026-11-04T14:21:12.282Z
- 2026-11-04T14:21:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T14:21:54Z · agent exited with an error (cursor) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:21:54Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:22:05Z · needs_input
- 2026-11-04T14:22:05Z · message_delivered: 1 message(s)
- 2026-11-04T14:22:52Z · agent exited with an error (cursor) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:22:52Z · engineer crash recovery: resuming cursor + composer-2.5 (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:23:18Z · needs_input
- 2026-11-04T14:31:00Z · agent exited with an error (cursor) · the agent process exited with an error — open the task to see the full output
- 2026-11-04T14:31:00Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-11-04T14:37:47Z · cli_override, model_override
- 2026-11-04T14:37:49Z · needs_input
- 2026-11-04T14:39:01Z · body
- 2026-11-04T14:45:47Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-04T14:45:47Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · Reading additional input from stdin...
- 2026-11-04T14:46:17Z · needs_input
- 2026-11-04T14:46:43Z · agent exited with an error (codex) · 2026-11-04T14:46:31.428988Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: IO error: invalid peer certificate: UnknownIssuer, url: wss://chatgpt.com/backend-api/codex/responses
- 2026-11-04T14:46:44Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · 2026-11-04T14:46:31.428988Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: IO error: invalid peer certificate: UnknownIssuer, url: wss://chatgpt.com/backend-api/codex/responses
- 2026-11-04T14:47:03Z · needs_input
- 2026-11-04T14:49:24Z · body
- 2026-11-04T14:53:17Z · cli_override, model_override
- 2026-11-04T14:54:07Z · engineer stopped by request
- 2026-11-04T15:00:20Z · body
- 2026-11-04T15:21:19Z · message_queued at 2026-11-04T15:21:19.332Z
- 2026-11-04T15:21:19Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T15:22:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T15:26:20Z · body
- 2026-11-04T15:28:04Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 12s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T15:28:19Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T15:49:27Z · body
- 2026-11-04T15:53:54Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T15:53:54Z · message_queued at 2026-11-04T15:53:54.434Z
- 2026-11-04T15:53:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-04T15:53:54Z · message_delivered: 2 message(s)
- 2026-11-04T16:24:12Z · message_queued at 2026-11-04T16:24:12.417Z
- 2026-11-04T16:24:15Z · message_delivered: 1 message(s)
- 2026-11-04T16:26:19Z · CTO nudge: held — remote validation is running
- 2026-11-04T16:29:42Z · note: handoff requested (cli)
- 2026-11-04T16:31:20Z · CTO nudge: held — handoff gate is running
- 2026-11-04T16:35:58Z · body
- 2026-11-04T16:39:26Z · message_queued at 2026-11-04T16:39:26.031Z
- 2026-11-04T16:39:26Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T16:44:24Z · CTO nudge: held — handoff gate is running
- 2026-11-04T16:58:58Z · note: ui verification failed (2 issue(s)): [missing-target] Board card clamps long check-wait detail (target "default"): state "card:checkWaitDetail" did not render on target "default" — / shows no task card (http://127.0.0.1:60707/?shotState=card%3AcheckWaitDetail); [missing-target] Board card clamps long check-wait detail (target "default"): highlight [data-test-id=task-card-needs-input-detail] matched nothing on / (http://127.0.0.1:60707/?shotState=card%3AcheckWaitDetail)
- 2026-11-04T16:58:58Z · message_queued at 2026-11-04T16:58:58.495Z
- 2026-11-04T16:59:01Z · message_delivered: 1 message(s)
- 2026-11-04T16:59:22Z · message_queued at 2026-11-04T16:59:22.962Z
- 2026-11-04T16:59:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T16:59:42Z · body
- 2026-11-04T17:08:50Z · body
- 2026-11-04T17:08:57Z · note: handoff requested (cli)
- 2026-11-04T17:09:25Z · CTO nudge: held — handoff gate is running
- 2026-11-04T17:12:21Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T17:12:21Z · message_queued at 2026-11-04T17:12:21.685Z
- 2026-11-04T17:12:21Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: All checks pass. Re-requesting handoff with the corrected card shot route. · stderr: (empty)
- 2026-11-04T17:21:59Z · status active→review
- 2026-11-04T17:22:50Z · note: review pass 1: needs some work
- 2026-11-04T17:22:50Z · message_queued at 2026-11-04T17:22:50.680Z
- 2026-11-04T17:22:50Z · status review→active
- 2026-11-04T17:22:53Z · CTO nudge: held — handoff gate is running
- 2026-11-04T17:26:37Z · status active→review
- 2026-11-04T17:29:05Z · note: review pass 2: needs some work
- 2026-11-04T17:29:05Z · message_delivered: 3 message(s)
- 2026-11-04T17:29:06Z · status review→active
- 2026-11-04T17:29:08Z · CTO nudge: held — remote validation is running
- 2026-11-04T17:29:30Z · note: adopted orphaned engineer pid 43820
- 2026-11-04T17:29:33Z · note: handoff requested (cli)
- 2026-11-04T17:34:30Z · CTO nudge: held — handoff gate is running
- 2026-11-04T17:42:23Z · message_queued at 2026-11-04T17:42:23.979Z
- 2026-11-04T17:42:24Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/task-card-review-rounds-detail.test.ts > review-rounds-exhausted card detail (#0832) > clamps long detail and does not repeat the verdict under the status chip, tests/task-check-wait-detail-clamp.test.ts > check-wait diagnostic clamp (#1034) > clamps the card detail line and keeps the full text in Status details, tests/task-drawer-status-summary.test.ts > task drawer status summary (#0952) > keeps the landable checklist off the card and opens Status details on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-04T17:43:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T17:56:54Z · note: handoff requested (cli)
- 2026-11-04T17:59:29Z · CTO nudge: held — handoff gate is running
- 2026-11-04T18:02:12Z · body
- 2026-11-04T18:05:50Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T18:05:51Z · message_queued at 2026-11-04T18:05:51.071Z
- 2026-11-04T18:05:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: All fixes are in and verified on the final tree. Requesting handoff. · stderr: (empty)
- 2026-11-04T18:05:51Z · status active→review
