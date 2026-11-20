---
id: "1260"
title: "Work board: apply the queue sort and make mobile-only status values visible"
type: bug
status: active
priority: p3
area: web
depends_on: ["1257"]
assigned_to: ai
created_by: t@t
branch: feat/work-board-apply-the-queue-sort-and-make
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T00:57:33Z"
updated_at: "2026-11-20T12:03:33Z"
close_out_repair_count: 1
review_passes: 2
review_rounds: 1
---
## Problem
Two gaps from #1257 (docs/qa/2026-11-filter-persistence-qa.md):
- The board ignores the queue sort (sort=oldest from the phone queue).
- Mobile-only status values in the URL (attention, held, archived, human, all) show every task on the board with no chip.

## Desired UX
Either apply these values on the board or show a chip that says they are not applied, the way the ignored-value notices work.

## Acceptance criteria
- Each URL value is either applied or shown with a notice; none is silently dropped.
- Covered by headless WebKit fixtures at 375, 768 and 1280 px.

## Notes for AI
Headless Playwright only, against fixtures. Do not touch repoos.toml. Keep the ignored-value notice path in src/ui-app/src/lib/workQueueFilters.ts.

## Shots
```json
[
{
"label": "Board with applied oldest-first sort and an ignored status notice",
"target": "default",
"route": "/work?sort=oldest&status=held",
"highlight": ".board-queue-filters"
}
]
```

## Activity

- 2026-11-20T00:57:33Z · created · t@t
- 2026-11-20T00:57:34Z · needs_input
- 2026-11-20T00:57:44Z · body: Notes for AI (added)
- 2026-11-20T00:57:44Z · needs_input
- 2026-11-20T01:42:23Z · status inbox→ready
- 2026-11-20T01:42:26Z · cli_override, model_override
- 2026-11-20T04:08:13Z · status ready→active, branch
- 2026-11-20T04:22:08Z · body
- 2026-11-20T04:36:19Z · body
- 2026-11-20T04:37:23Z · CTO nudge: held — handoff gate is running
- 2026-11-20T04:52:14Z · handoff failed · remote validation failed: test failure: gate exit 1 on mini — fix it in the feature branch and re-run the gate
- 2026-11-20T04:52:15Z · message_queued at 2026-11-20T04:52:15.184Z
- 2026-11-20T04:52:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T04:55:17Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T04:55:22Z · message_delivered: 1 message(s)
- 2026-11-20T05:01:02Z · body
- 2026-11-20T05:43:28Z · CTO nudge: held — handoff gate is running
- 2026-11-20T05:47:33Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-20T05:47:37Z · status active→review
- 2026-11-20T05:47:38Z · message_queued at 2026-11-20T05:47:38.246Z
- 2026-11-20T05:49:24Z · note: review pass 1: needs some work
- 2026-11-20T05:49:25Z · message_delivered: 1 message(s)
- 2026-11-20T05:49:25Z · status review→active
- 2026-11-20T05:49:27Z · CTO nudge: held — remote validation is running
- 2026-11-20T05:54:47Z · body
- 2026-11-20T05:57:30Z · CTO nudge: held — handoff gate is running
- 2026-11-20T05:59:40Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-20T05:59:43Z · status active→review
- 2026-11-20T05:59:43Z · message_queued at 2026-11-20T05:59:43.561Z
- 2026-11-20T06:00:31Z · note: review pass 2: good to go
- 2026-11-20T07:07:02Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T09:14:42Z · status review→active
- 2026-11-20T09:14:42Z · note: close-out repair: merge-conflict
- 2026-11-20T09:14:42Z · message_delivered: 1 message(s)
- 2026-11-20T09:29:43Z · CTO nudge: held — handoff gate is running
- 2026-11-20T10:10:23Z · message_queued at 2026-11-20T10:10:23.334Z
- 2026-11-20T10:10:45Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T10:13:34Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T10:18:36Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: gate exit 1 on mini — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-11-20T10:18:39Z · note: handoff requested (cli)
- 2026-11-20T10:18:57Z · message_queued at 2026-11-20T10:18:57.888Z
- 2026-11-20T10:18:58Z · handoff failed · task-file handoff failed at commit · git commit failed: fatal: cannot do a partial commit during a merge.
- 2026-11-20T10:43:52Z · watchdog: check wait escalated · waiting: system load is high (5.5× per CPU, limit 3×) — waiting for headroom before starting more work; wait exceeds the handoff deadline for 30m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-20T11:09:48Z · needs_input
- 2026-11-20T11:09:49Z · message_delivered: 1 message(s)
- 2026-11-20T11:20:50Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T11:53:21Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: #1260 is not ready to hand off. The feature code is already in place, but two things block the handoff: the merge is unconcluded and the scoped check's tests step is red. I did not emit `::repoos-handoff-ready::`. **Stuck on:** 1. **Unconc… · stderr: (empty)
- 2026-11-20T11:57:47Z · message_delivered: 1 message(s)
- 2026-11-20T12:01:29Z · body
- 2026-11-20T12:03:33Z · CTO nudge: held — handoff gate is running
