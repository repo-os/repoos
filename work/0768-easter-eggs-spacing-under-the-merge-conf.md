---
id: "0768"
title: "Easter eggs: spacing under the merge-conflict message on review cards"
type: bug
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-spacing-under-the-merge-conf
created_at: "2026-10-13T14:30:17Z"
updated_at: "2026-10-13T17:27:40Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-13T17:21:50.543Z: repoos check failed: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:54743/api/tasks/9999/diff-stats (http://127.0.0.1:54743/api/tasks/9999/diff-stats); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:54743/api/tasks/9999/diff-stats)"
review_rounds: 1
review_passes: 1
---
## Problem
On a review card with a merge conflict (Move to done failed at merge), the 'Merge conflict in N file.' line sits too close to the action row below it, so the card looks unbalanced. Seen on #0762 with 'Sent to Debugger'.

## Desired UX
- Consistent spacing between the conflict message and the action row, matching the other status rows on the card.
- Remove agent button in the Budget Controls allowlist (Agents page, Budget Controls tab from #0764): move it from the inline row to the upper-right corner of each coding agent's row, so the row reads cleanly.

## Acceptance criteria
- Conflict message spacing fixed in the card's shared styles (use the global form/card classes, not a bespoke colour).
- Remove agent sits in the upper-right of each agent row, keyboard reachable, same behaviour.
- Checked in light and dark themes.

## Notes for AI
Start from the task card component that renders 'Merge conflict' and the allowlist section once #0764 lands. Small, cosmetic fixes only; no behaviour changes.

## Shots
```json
[
{
"label": "Work board: merge-conflict message spacing above the action row",
"target": "default",
"route": "/work?status=review",
"highlight": ".tc-done-error",
"steps": [
{
  "waitFor": ".tc-done-error"
}
],
"state": "card:doneError"
},
{
"label": "Agents Budget Controls: Remove agent sits in each row upper-right",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": ".budget-row",
"steps": [
{
  "waitFor": ".budget-row"
}
]
}
]
```

## Activity

- 2026-10-13T14:30:17Z · created · njachowski@gmail.com
- 2026-10-13T15:26:15Z · status inbox→ready
- 2026-10-13T16:37:10Z · body
- 2026-10-13T16:59:16Z · status ready→active, branch
- 2026-10-13T17:03:24Z · body
- 2026-10-13T17:04:22Z · body
- 2026-10-13T17:06:01Z · body: section Shots
- 2026-10-13T17:12:35Z · status active→review
- 2026-10-13T17:12:48Z · note: highlight .tc-done-error matched nothing on /
- 2026-10-13T17:13:44Z · note: review pass 1: needs some work
- 2026-10-13T17:13:44Z · status review→active
- 2026-10-13T17:14:39Z · body: section Shots
- 2026-10-13T17:21:47Z · note: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:54743/api/tasks/9999/diff-stats (http://127.0.0.1:54743/api/tasks/9999/diff-stats); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:54743/api/tasks/9999/diff-stats)
- 2026-10-13T17:27:40Z · message_queued at 2026-10-13T17:27:40.418Z
