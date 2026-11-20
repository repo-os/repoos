---
id: "1260"
title: "Work board: apply the queue sort and make mobile-only status values visible"
type: bug
status: review
priority: p3
area: web
depends_on: ["1257"]
assigned_to: ai
created_by: t@t
branch: feat/work-board-apply-the-queue-sort-and-make
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T00:57:33Z"
updated_at: "2026-11-20T05:47:37Z"
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
