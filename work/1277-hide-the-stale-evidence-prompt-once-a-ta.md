---
id: "1277"
title: Hide the stale-evidence prompt once a task is queued or moving to done
type: feature
status: active
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: feat/hide-the-stale-evidence-prompt-once-a-ta
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T08:26:19Z"
updated_at: "2026-11-22T15:26:56Z"
review_rounds: 1
review_passes: 4
last_check_failure: "repoos check at 2026-11-22T13:48:50.335Z: repoos check failed: ui verification failed: timed out waiting for the task's browser capture"
---
## Problem
A review card that is already queued for close-out (Moving to done, queued #N) still shows 'Stale evidence is the only finding · repoos verify <id>' and a Refresh evidence button. Once close-out is queued or running the evidence prompt is noise, and clicking it would start a new review on a task that is mid-close-out.

## Desired UX
While a task has an active or queued close-out job, the card and drawer hide the stale-evidence notice and Refresh evidence button (and the CLI refuses repoos verify with a clear message, as it already does while a close-out is active). They come back if the close-out fails and the task returns to review.

## Acceptance criteria
- TaskCard.vue (stale evidence block near line 2049) and TaskDrawer.vue (Refresh evidence near line 7414) are hidden whenever the integration job phase is queued, syncing, validating, publishing or cleanup.
- Shown again after a failed job.
- Test covering queued, validating and failed states.

## Notes for AI
Also (Nick): on the card and drawer, show only the Refresh evidence button; do not show the repoos verify <id> command text. Shorten the notice text to just: Stale evidence. Update any tests that assert the old wording. Never touch repoos.toml. Headless Playwright only.

## Shots
```json
[
{
"label": "Queued close-out card hides the stale-evidence notice and Refresh evidence",
"target": "default",
"route": "/work",
"highlight": "[data-task-id=\"9999\"]",
"state": "card:staleEvidenceQueued"
}
]
```

## Screenshots

![#1269 is queued for close-out but still shows Stale evidence is the only finding and a Refresh evidence button](/api/tasks/1277/attachments/att_bc4dc94a-abc2-4b59-889e-3791e4512fd9.png)

## Activity

- 2026-11-20T08:26:19Z · created · t@t
- 2026-11-20T08:26:22Z · screenshots
- 2026-11-20T08:26:34Z · status inbox→ready
- 2026-11-20T08:27:03Z · body: Notes for AI (added 1, removed 1)
- 2026-11-22T11:37:08Z · cli_override, model_override
- 2026-11-22T11:37:09Z · status ready→active, branch
- 2026-11-22T11:47:11Z · body
- 2026-11-22T11:51:56Z · CTO nudge: held — handoff gate is running
- 2026-11-22T11:53:52Z · note: ui verification failed: ui verification failed (2 issue(s)): [route] auto: matched src/ui-app/** · phone 390x844: declared route / but the browser landed on /work (login or redirect?) (captured http://127.0.0.1:38563/work) (http://127.0.0.1:38563/work); [route] auto: matched src/ui-app/** · desktop 1280x800: declared route / but the browser landed on /work (login or redirect?) (captured http://127.0.0.1:38563/work) (http://127.0.0.1:38563/work)
- 2026-11-22T11:53:52Z · message_queued at 2026-11-22T11:53:52.697Z
- 2026-11-22T11:53:55Z · message_delivered: 1 message(s)
- 2026-11-22T11:54:42Z · body
- 2026-11-22T12:11:38Z · body
- 2026-11-22T12:14:43Z · CTO nudge: held — handoff gate is running
- 2026-11-22T12:15:46Z · message_queued at 2026-11-22T12:15:46.285Z
- 2026-11-22T12:15:49Z · message_delivered: 1 message(s)
- 2026-11-22T12:16:15Z · body
- 2026-11-22T12:21:56Z · message_queued at 2026-11-22T12:21:56.470Z
- 2026-11-22T12:21:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-22T12:25:05Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-22T12:25:05Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The scoped check is running in the background. I'll hand off once it passes. The capture of `/work` timed out at 5 s on the screenshot step. The shot selected the fixture card, and Playwright's element screenshot waits for the element to b… · stderr: (empty)
- 2026-11-22T12:25:05Z · message_delivered: 1 message(s)
- 2026-11-22T12:26:56Z · message_queued at 2026-11-22T12:26:56.413Z
- 2026-11-22T12:26:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-22T12:27:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-22T12:27:16Z · note: handoff requested (cli)
- 2026-11-22T12:29:21Z · CTO nudge: held — handoff gate is running
- 2026-11-22T12:42:30Z · body
- 2026-11-22T12:48:54Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-22T12:48:57Z · status active→review
- 2026-11-22T13:08:01Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-22T13:08:02Z · message_queued at 2026-11-22T13:08:02.800Z
- 2026-11-22T13:08:04Z · note: review pass 1: needs some work
- 2026-11-22T13:09:25Z · note: review pass 2: needs some work
- 2026-11-22T13:09:26Z · status review→active
- 2026-11-22T13:09:28Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-22T13:14:32Z · message_delivered: 1 message(s)
- 2026-11-22T13:26:56Z · message_queued at 2026-11-22T13:26:56.435Z
- 2026-11-22T13:26:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-22T13:26:58Z · engineer stopped by request
- 2026-11-22T13:27:03Z · message_delivered: 1 message(s)
- 2026-11-22T13:38:05Z · body
- 2026-11-22T13:44:56Z · body
- 2026-11-22T13:45:46Z · status active→review
- 2026-11-22T13:48:47Z · note: shots: failed — browser capture cancelled
- 2026-11-22T13:48:47Z · message_queued at 2026-11-22T13:48:47.196Z
- 2026-11-22T13:48:48Z · note: review pass 3: needs some work
- 2026-11-22T13:48:50Z · message_delivered: 1 message(s)
- 2026-11-22T14:08:36Z · status review→active
- 2026-11-22T14:08:39Z · engineer stopped by request
- 2026-11-22T14:08:41Z · orphaned run process stopped · pid 18008 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun /Users/nick/code/nick/repoos/dist/core/heavy-wrap.js /Users/n · cpu 0s · age 20m
- 2026-11-22T14:08:44Z · note: handoff requested (cli)
- 2026-11-22T14:08:56Z · orphaned run process stopped · pid 24492 · ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval · cpu 0s · age 19m
- 2026-11-22T14:33:53Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-22T14:33:54Z · status active→review
- 2026-11-22T14:33:55Z · message_queued at 2026-11-22T14:33:55.184Z
- 2026-11-22T14:34:41Z · note: review pass 4: needs some work
- 2026-11-22T14:53:03Z · message_delivered: 1 message(s)
- 2026-11-22T14:53:04Z · status review→active
- 2026-11-22T15:03:01Z · message_queued at 2026-11-22T15:03:01.232Z
- 2026-11-22T15:03:01Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-22T15:06:03Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-22T15:06:03Z · message_delivered: 1 message(s)
- 2026-11-22T15:06:56Z · body
- 2026-11-22T15:26:54Z · engineer stopped by request
- 2026-11-22T15:26:56Z · note: handoff requested (cli)
