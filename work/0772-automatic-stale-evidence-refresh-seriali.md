---
updated_at: "2026-10-15T18:33:25Z"
review_passes: 1
id: "0772"
title: "Automatic stale-evidence refresh: serialize with engineer starts and reviews"
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/automatic-stale-evidence-refresh-seriali
created_at: "2026-10-14T03:37:55Z"
---
## Problem
Task #0766 adds a manual 'Refresh evidence' action (button, CLI, API). Its automatic counterpart, which refreshes stale evidence on its own when a review finds only stale evidence and re-reviews instead of sending the task back to the engineer, was removed from #0766 because it kept failing review on concurrency gaps.

The automatic path must take the same locks as every other way an engineer or review can start, before its first await:
- src/server/routes/tasks.ts (automatic refresh, around 1245-1275): HEAD is read before the refresh lock is taken, and task status and running agents/reviews are not rechecked. A follow-up engineer turn or a manual review can start in that gap.
- The automatic path must also set the evidence-refresh-active flag that ReviewManager.run() checks (src/server/review.ts ~812-815).
- Stale-only failures must stay in review regardless of the auto-refresh setting (review.ts ~1209-1217 currently calls autoBounce).
- Engineer start and the review route must check the refresh lock before starting.

## Desired UX
A stale-only review finding refreshes evidence automatically and re-reviews, without an engineer round trip, and never overlaps a live engineer or reviewer.

## Acceptance criteria
- Tests for: refresh overlapping an engineer start; refresh overlapping a review start; stale-only failure stays in review; automatic refresh never changes tracked files or HEAD.
- The setting that enables it has a Settings control (AGENTS.md).

## Notes for AI
Start from the manual refresh implementation added by #0766 (routes/tasks.ts verify route, server.ts ~2058-2084, ui-handoff-gate.ts). Reviews on #0766 (passes 14-24, .repoos/reviews/0766.md) list the concrete races. Filed when #0766 was narrowed to the manual path.

## Shots
```json
[
{
"label": "New \"Auto-refresh stale review evidence once\" toggle in Settings → General",
"target": "default",
"route": "/settings?tab=general",
"highlight": "[data-config-key=\"uiVerification.autoRefreshStaleOnce\"]"
}
]
```

## Activity

- 2026-10-14T03:37:55Z · created · njachowski@gmail.com
- 2026-10-14T05:42:00Z · status inbox→ready
- 2026-10-15T17:33:56Z · status ready→active, branch
- 2026-10-15T17:49:32Z · message_queued at 2026-10-15T17:49:32.335Z
- 2026-10-15T17:49:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T18:21:39Z · body
- 2026-10-15T18:25:03Z · body: section Shots
- 2026-10-15T18:32:20Z · status active→review
- 2026-10-15T18:33:25Z · note: review pass 1: good to go

