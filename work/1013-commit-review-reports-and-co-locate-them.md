---
id: 1013
title: Commit review reports and co-locate them with engineering reports
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/commit-review-reports-and-co-locate-them
created_at: "2026-11-03T05:23:01Z"
updated_at: "2026-11-03T16:37:31Z"
---
## Problem
Engineering reports are committed under `work/engineering-reports/<id>/round-N.json`. Review reports live in gitignored cache (`.repoos/reviews/<id>/`), so they vanish with the machine and future agents/humans never see why a task went through several rounds. Both are essential history of one loop (engineer changes, writes report, reviewer reviews, repeat) and should be tracked together.

## Desired UX
- Review reports are committed in the repo, in the same per-task place as engineering reports (e.g. `work/reports/<id>/` with engineer and review rounds side by side, or interleaved by round). Migrate existing engineering reports (only #0997 so far) and keep readers (Dev/Review tabs, reviewer's "earlier reports" lookup in `review.ts`) working.
- Landable Task scope check, close-out, and handoff-drift rules treat both report kinds as this task's own bookkeeping, never another task's.

## Acceptance criteria
- [ ] Review reports are written to the shared tracked location and survive a fresh clone.
- [ ] Engineering and review reports for one task live together; existing files migrated, parser reads old locations.
- [ ] Committing a review report does not invalidate the review lock (lock sha vs worktree HEAD), nor trip the Move to done drift check or the "worktree clean" check; add tests.
- [ ] Task scope exemption in `isForbiddenTaskScopePath` covers the new location, still fails for other tasks' reports.
- [ ] `user-docs/engineering-reports.md`, review docs and AGENTS.md updated where they describe locations.

## Notes for AI
Main design risk: the review lock records the reviewed HEAD sha, so committing the review report after the review moves HEAD. Decide whether the report commit is excluded from the lock/drift comparison (like `work/*.md`-only commits, #0600) or written by close-out. See `src/server/review.ts` (~line 488), `src/server/engineering-reports.ts`, `src/core/landable.ts`.

## Activity

- 2026-11-03T05:23:01Z · created · njachowski@gmail.com
- 2026-11-03T05:53:32Z · status inbox→ready
- 2026-11-03T05:53:35Z · status ready→active, branch
- 2026-11-03T16:37:31Z · status active→review
