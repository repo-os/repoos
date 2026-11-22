---
id: "1279"
title: "Easter eggs bundle: rename review history column to Issues"
type: feature
status: review
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: 8dbfd6ac
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-rename-review-history
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T10:35:33Z"
updated_at: "2026-11-22T15:16:52Z"
review_passes: 6
last_check_failure: "repoos check at 2026-11-22T14:04:01.314Z: repoos check failed: reused check inputs changed during handoff — run the check again"
handoff_signal_retry_count: 1
review_rounds: 2
---
## Problem
The review pass history table in the task drawer has a column headed 'finding classes', which means little to a reader. It is useful as a quick view of what is wrong when a pass is not good to go.

## Desired UX
1. Rename the review history column 'Finding classes' to 'Issues'. Keep the content (reviewer class labels, a dash when none).
2. Work board cards: show the task number as plain text, not a chip/button, the way the Pipeline view does, to save space on the card's top line. The task number chip in the task drawer stays the clickable one.
3. The top line of a board card (task number, type, priority and robot icon) must never wrap to a second line. If something must shrink to fit, shorten the type label 'feature' to 'feat'.

## Acceptance criteria
- Header in TaskDrawer.vue (finding classes th, around line 7069) reads Issues; user-docs wording that says finding classes is reworded to match; internal names unchanged.
- Board card top line uses the plain task number as in the pipeline card, and stays on one line at 375, 768 and 1280 px widths, including long ids and p1 badges; 'feature' becomes 'feat' only when needed to fit.
- Tests asserting the old header text or the old chip are updated; headless fixtures at 375, 768 and 1280.

## Notes for AI
Copy change only. Never touch repoos.toml. Headless Playwright only.

## Shots
```json
[
{
"label": "Review pass history: last column now reads Issues",
"target": "default",
"route": "/work?task=9999&tab=review",
"highlight": ".review-history-table",
"state": "drawer:reviewPasses"
},
{
"label": "Board cards: task number is plain text on a one-line top row",
"target": "default",
"route": "/work",
"highlight": ".task-card .tc-top-line",
"state": "board:cardChips"
}
]
```

## Screenshots

![Review pass history table with the Finding classes column](/api/tasks/1279/attachments/att_f890472a-9287-4186-9f3b-df29a2c0616b.png)
![Pipeline view: task number is plain text (#1275 FEATURE P1)](/api/tasks/1279/attachments/att_2af63faa-2ce5-45f6-9a94-683f604594c0.png)
![Board view: task number is a chip (#1279, #1271)](/api/tasks/1279/attachments/att_d98615f9-d1e6-40f5-aa8f-a5988611a4cc.png)

## Activity

- 2026-11-20T10:35:33Z · created · t@t
- 2026-11-20T10:36:08Z · screenshots
- 2026-11-20T10:37:42Z · status inbox→ready
- 2026-11-20T10:38:55Z · title
- 2026-11-20T10:45:33Z · body: Desired UX (added 3, removed 1)
- 2026-11-20T10:45:44Z · body: Acceptance criteria (added 3, removed 3)
- 2026-11-20T10:45:44Z · needs_input
- 2026-11-20T10:45:58Z · screenshots
- 2026-11-20T10:46:10Z · screenshots
- 2026-11-20T10:46:24Z · body: Acceptance criteria (added 1, removed 1)
- 2026-11-20T10:46:25Z · needs_input
- 2026-11-22T11:37:13Z · cli_override, model_override
- 2026-11-22T11:37:14Z · status ready→active, branch
- 2026-11-22T11:54:19Z · body
- 2026-11-22T11:55:16Z · body
- 2026-11-22T11:56:56Z · CTO nudge: held — handoff gate is running
- 2026-11-22T12:01:04Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Review pass history: last column now reads Issues (target "default"): highlight .review-history-table matched nothing on /work?task=9999&tab=review (http://127.0.0.1:41827/work?task=9999&tab=review&shotState=drawer%3AreviewPasses)
- 2026-11-22T12:01:04Z · message_queued at 2026-11-22T12:01:04.779Z
- 2026-11-22T12:01:07Z · message_delivered: 1 message(s)
- 2026-11-22T12:01:50Z · body
- 2026-11-22T12:09:59Z · body
- 2026-11-22T12:11:56Z · CTO nudge: held — handoff gate is running
- 2026-11-22T12:14:40Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-22T12:14:41Z · status active→review
- 2026-11-22T12:14:41Z · message_queued at 2026-11-22T12:14:41.303Z
- 2026-11-22T12:15:37Z · note: review pass 1: needs some work
- 2026-11-22T12:15:38Z · message_delivered: 1 message(s)
- 2026-11-22T12:15:38Z · status review→active
- 2026-11-22T12:15:40Z · CTO nudge: held — remote validation is running
- 2026-11-22T12:25:10Z · body
- 2026-11-22T12:26:56Z · CTO nudge: held — handoff gate is running
- 2026-11-22T12:29:18Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-22T12:29:19Z · status active→review
- 2026-11-22T12:29:19Z · message_queued at 2026-11-22T12:29:19.926Z
- 2026-11-22T12:30:35Z · note: review pass 2: needs some work
- 2026-11-22T12:30:36Z · status review→active
- 2026-11-22T12:30:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-22T12:35:53Z · message_queued at 2026-11-22T12:35:53.562Z
- 2026-11-22T12:40:38Z · message_delivered: 1 message(s)
- 2026-11-22T12:53:22Z · body
- 2026-11-22T12:54:34Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-22T12:54:34Z · message_queued at 2026-11-22T12:54:34.770Z
- 2026-11-22T12:54:34Z · ↻ resuming engineer to read queued message
- 2026-11-22T12:54:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The check passes locally and on the remote run. The draft directory is empty, so I'll write this round's report draft. · stderr: (empty)
- 2026-11-22T12:54:35Z · message_delivered: 2 message(s)
- 2026-11-22T12:56:48Z · CTO nudge: held — handoff gate is running
- 2026-11-22T13:00:07Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-22T13:00:08Z · status active→review
- 2026-11-22T13:00:09Z · message_queued at 2026-11-22T13:00:09.030Z
- 2026-11-22T13:01:44Z · note: review pass 3: needs some work
- 2026-11-22T13:01:44Z · needs_input
- 2026-11-22T13:07:30Z · status review→active
- 2026-11-22T13:07:32Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-22T13:07:32Z · needs_input
- 2026-11-22T13:07:33Z · message_delivered: 1 message(s)
- 2026-11-22T13:08:10Z · body
- 2026-11-22T13:20:05Z · body
- 2026-11-22T13:21:19Z · status active→review
- 2026-11-22T13:30:02Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-22T13:30:04Z · note: review pass 4: needs some work
- 2026-11-22T13:30:04Z · needs_input
- 2026-11-22T13:30:05Z · message_queued at 2026-11-22T13:30:05.873Z
- 2026-11-22T13:47:09Z · status review→active
- 2026-11-22T13:47:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-22T13:47:12Z · needs_input
- 2026-11-22T13:47:13Z · message_delivered: 1 message(s)
- 2026-11-22T14:01:37Z · body
- 2026-11-22T14:02:53Z · status active→review
- 2026-11-22T14:03:56Z · note: review pass 5: needs some work
- 2026-11-22T14:03:57Z · message_queued at 2026-11-22T14:03:57.944Z
- 2026-11-22T14:04:00Z · message_delivered: 1 message(s)
- 2026-11-22T14:05:10Z · note: shots: failed — browser capture cancelled
- 2026-11-22T14:08:53Z · status review→active
- 2026-11-22T14:08:55Z · engineer stopped by request
- 2026-11-22T14:09:01Z · note: handoff requested (cli)
- 2026-11-22T14:31:01Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-22T14:31:03Z · status active→review
- 2026-11-22T14:31:03Z · message_queued at 2026-11-22T14:31:03.663Z
- 2026-11-22T14:32:15Z · note: review pass 6: needs some work
- 2026-11-22T14:32:16Z · needs_input
- 2026-11-22T15:06:55Z · status review→active
- 2026-11-22T15:06:57Z · needs_input
- 2026-11-22T15:06:57Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-22T15:06:57Z · message_delivered: 1 message(s)
- 2026-11-22T15:15:41Z · body
- 2026-11-22T15:16:52Z · status active→review
