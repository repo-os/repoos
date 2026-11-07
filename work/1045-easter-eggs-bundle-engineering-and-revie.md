---
id: 1045
title: "Easter eggs bundle: engineering and review report tables"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-engineering-and-revie
cli_override: codex
model_override: gpt-6-luna
review_cli_override: claude code
review_model_override: haiku
created_at: "2026-11-06T22:56:38Z"
updated_at: "2026-11-07T04:09:03Z"
last_check_failure: "repoos check at 2026-11-07T03:52:16.390Z: repoos check failed: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:54844/api/tasks/9999/summary (http://127.0.0.1:54844/api/tasks/9999/summary); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:54844/api/tasks/9999/summary)"
---
## Problem

The two report tables in the task drawer disagree with each other. The Dev tab's engineering report table lists rounds oldest first with a short time (`14:26`) and right-aligned cells. The Review tab's pass table lists newest first with left-aligned cells and a long date and time (`07/11/2026, 06:38:29`). Neither shows the full time anywhere when the short form is used. Screenshots 1 (engineering) and 2 (review) are attached.

## Desired UX

- **Order:** the engineering report table is newest round first, like the review table.
- **Time format:** the review table uses the short time field the engineering table uses. Make the short form unambiguous: time only for today, and a short date plus time for other days, so rounds across several days stay readable.
- **Hover:** hovering (and keyboard focus or touch tap) on any short time in either table shows the full date and time in a styled popup, not a native `title` tooltip.
- **Alignment:** the engineering table's cells are left aligned like the review table (header and body), with no stray right alignment.
- Both tables keep one shared row style, so the next change lands in both.

## Acceptance criteria

- Round 6 is the first row and round 1 the last in the engineering table.
- The review table shows short times, and its newest pass stays on top.
- Hovering or focusing a time in either table opens the shared styled tooltip or popover with the full local date and time; it is keyboard and touch usable.
- Engineering table cells and headers are left aligned.
- Unit tests cover the sort order and the short and full time formatting; one declared shot shows the Dev > Report table, scoped to the fixture card.

## Notes for AI

Both tables live in `src/ui-app/src/components/TaskDrawer.vue` (the engineering one near the `engineering-report-view` pane, `fmtTime(report.at)`; the Review tab has its own pass table). Reuse `src/ui-app/src/lib/time.ts` for formatting and add one shared short and full time helper. Use the shared styled tooltip or popover, never a native `title`. CSS goes in `style.css` or shared classes, not bespoke scoped styles. Shot hygiene: scope selectors to the fixture card `[data-task-id="9999"]` and confirm one match.

## Shots
```json
[
{
"label": "Dev engineering report history, newest round first",
"target": "default",
"route": "/work?task=9999&tab=agent&shotState=drawer%3AengineeringReports",
"selector": "[data-task-id=\"9999\"]",
"highlight": "[data-task-id=\"9999\"]",
"steps": [
{
"click": "[data-test-id=\"engineering-report-tab\"]"
}
],
"state": "drawer:engineeringReports"
}
]
```

## Screenshots

![9](/api/tasks/1045/attachments/att_3b5690c0-6904-4c9e-be77-c2ac034988bc.png)
![10](/api/tasks/1045/attachments/att_94696a90-b332-4444-85e5-f48a15612d80.png)

## Activity

- 2026-11-06T22:56:38Z · created · njachowski@gmail.com
- 2026-11-06T22:56:38Z · screenshots
- 2026-11-07T02:11:45Z · cli_override
- 2026-11-07T02:11:46Z · model_override
- 2026-11-07T02:11:52Z · review_cli_override
- 2026-11-07T02:11:53Z · review_model_override
- 2026-11-07T02:11:54Z · status inbox→ready
- 2026-11-07T02:12:04Z · status ready→active, branch
- 2026-11-07T02:20:26Z · body
- 2026-11-07T02:31:39Z · body
- 2026-11-07T02:37:50Z · CTO nudge: held — handoff gate is running
- 2026-11-07T02:44:03Z · CTO nudge: held — handoff gate is running
- 2026-11-07T03:09:05Z · message_queued at 2026-11-07T03:09:05.440Z
- 2026-11-07T03:09:05Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-07T03:09:08Z · message_delivered: 1 message(s)
- 2026-11-07T03:11:10Z · note: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:51875/api/tasks/9999/summary (http://127.0.0.1:51875/api/tasks/9999/summary); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:51875/api/tasks/9999/summary)
- 2026-11-07T03:19:03Z · message_queued at 2026-11-07T03:19:03.553Z
- 2026-11-07T03:19:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T03:23:58Z · body
- 2026-11-07T03:24:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T03:29:03Z · CTO nudge: held — handoff gate is running
- 2026-11-07T03:52:12Z · note: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:54844/api/tasks/9999/summary (http://127.0.0.1:54844/api/tasks/9999/summary); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:54844/api/tasks/9999/summary)
- 2026-11-07T03:52:13Z · message_queued at 2026-11-07T03:52:13.021Z
- 2026-11-07T03:52:16Z · message_delivered: 1 message(s)
- 2026-11-07T04:05:21Z · body
- 2026-11-07T04:09:03Z · CTO nudge: held — handoff gate is running

