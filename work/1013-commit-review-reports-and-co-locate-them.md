---
id: 1013
title: Commit review reports and co-locate them with engineering reports
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/commit-review-reports-and-co-locate-them
created_at: "2026-11-03T05:23:01Z"
updated_at: "2026-11-03T07:53:32Z"
---
## Problem
Engineering reports are committed under `work/engineering-reports/<id>/round-N.json`. Review reports live in gitignored cache (`.repoos/reviews/<id>/`), so they vanish with the machine and future agents/humans never see why a task went through several rounds. Both are essential history of one loop (engineer changes, writes report, reviewer reviews, repeat) and should be tracked together.

## Desired UX
- Review reports are committed in the repo, in the same per-task place as engineering reports (e.g. `work/reports/<id>/` with engineer and review rounds side by side, or interleaved by round). Migrate existing engineering reports (only #0997 so far) and keep readers (Dev/Review tabs, reviewer's "earlier reports" lookup in `review.ts`) working.
- Landable Task scope check, close-out, and handoff-drift rules treat both report kinds as this task's own bookkeeping, never another task's.
- Dev tab UI fix: the new engineering Chat/Report view is not laid out like the Review tab. Reuse the Review tab's layout and styling exactly (screenshots attached: the Review tab, and the Dev tab as it is now). Report goes on the LEFT and Chat on the RIGHT of the sub-tab selector, and the model/agent selector row sits ABOVE the selector so it is always visible.

## Acceptance criteria
- [ ] Review reports are written to the shared tracked location and survive a fresh clone.
- [ ] Engineering and review reports for one task live together; existing files migrated, parser reads old locations.
- [ ] Committing a review report does not invalidate the review lock (lock sha vs worktree HEAD), nor trip the Move to done drift check or the "worktree clean" check; add tests.
- [ ] Task scope exemption in `isForbiddenTaskScopePath` covers the new location, still fails for other tasks' reports.
- [ ] `user-docs/engineering-reports.md`, review docs and AGENTS.md updated where they describe locations.

## Notes for AI
Main design risk: the review lock records the reviewed HEAD sha, so committing the review report after the review moves HEAD. Decide whether the report commit is excluded from the lock/drift comparison (like `work/*.md`-only commits, #0600) or written by close-out. See `src/server/review.ts` (~line 488), `src/server/engineering-reports.ts`, `src/core/landable.ts`.

## Screenshots

![Review tab: model row above, REPORT left / CHAT right (the layout to copy)](/api/tasks/1013/attachments/att_a9fa8210-fdaf-49ca-a91c-56d0d069efec.png)
![Dev tab today: Chat left / Report right, model row below the selector (to fix)](/api/tasks/1013/attachments/att_12e255b3-f63f-4d94-95a5-aff5091335f9.png)

## Activity

- 2026-11-03T05:23:01Z · created · njachowski@gmail.com
- 2026-11-03T05:53:32Z · status inbox→ready
- 2026-11-03T05:53:35Z · status ready→active, branch
- 2026-11-03T05:55:37Z · body: Desired UX (added 1)
- 2026-11-03T05:55:37Z · message_queued at 2026-11-03T05:55:37.514Z
- 2026-11-03T05:55:38Z · screenshots
- 2026-11-03T05:55:39Z · screenshots
- 2026-11-03T05:55:43Z · message_queued at 2026-11-03T05:55:43.965Z
- 2026-11-03T05:57:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T07:05:09Z · message_overdue: still queued after 60m without being delivered
- 2026-11-03T07:12:21Z · body
- 2026-11-03T07:28:48Z · engineer stopped by request
- 2026-11-03T07:28:55Z · message_delivered: 2 message(s)
- 2026-11-03T07:33:02Z · body
- 2026-11-03T07:42:35Z · message_queued at 2026-11-03T07:42:35.381Z
- 2026-11-03T07:42:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T07:47:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T07:53:32Z · CTO nudge: held — an undelivered message is already queued
