---
id: "1064"
title: Live index turns review report files into inbox tasks (review-1..N)
type: bug
status: active
paths: [src/server/live-index.ts, src/core/indexer.ts]
priority: p1
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/live-index-turns-review-report-files-int
created_at: "2026-11-08T12:47:28Z"
updated_at: "2026-11-08T13:49:13Z"
---
## Problem
Reported from the "tiao" project (RepoOS v0.5.77, workDir `repoos/work`). The Work board's Inbox fills with cards `review-1` … `review-5` (type feature, area general). Opening one shows path `repoos/work/reports/0006/review-1.md`, and its "spec" is the report body. Cards from different tasks collide on the same derived id, so the latest write wins.

Cause: `LiveIndex.applyFileChange` (src/server/live-index.ts) is the file-watcher path. Its `isTaskFile` accepts any file with a task extension under workDir. It neither skips `<workDir>/reports/` nor requires an `id` in frontmatter. `buildIndex` and `buildIndexDetailedAsync` (src/core/indexer.ts) do both (`nonTaskDirs`, and the `"id" in data` guard), so a fresh start looks fine and the bug only appears while the server is running and a report is written or changed. Review reports have `task:` frontmatter and no `id:`, so parseTask derives the id from the filename.

## Desired UX
Review report files never appear on the Work board, Inbox or any task list, whether the server just started or has been running for days. The board only ever shows real tasks. Nothing offers Delete or Archive on a report file.

## Acceptance criteria
- Files under `<workDir>/reports/` (and the legacy `<workDir>/engineering-reports/`) never become tasks via the live index.
- `applyFileChange` skips files whose frontmatter has no `id`, the same rule the indexer applies (and does not leave any existing entry for that path in the index).
- One shared predicate (non-task directory + id check) used by buildIndex, buildIndexDetailedAsync, and LiveIndex so they cannot drift again; doctor.ts `walkTaskFiles` also skips reports.
- Tests: with a running LiveIndex, writing `<workDir>/reports/0006/review-1.md` (frontmatter `task: "0006"`, no `id`) creates no task and emits no event. Use a non-default workDir such as `repoos/work`. A real task file still indexes. A stale `review-N` entry in an existing index is dropped on reload.
- Check the Delete task / Archive actions cannot act on a non-task file.

## Notes for AI
Failure mode to avoid: the cards offer "Delete task", which would delete the stored review report; don't change report storage, only indexing. Related: reports dir exclusion was added in #1029 for the startup indexer only. Separate cause of the report content ("opencode agent exited without output… Unexpected server error") is a reviewer model failure on that host, not this bug.

## Activity

- 2026-11-08T12:47:28Z · created · njachowski@gmail.com
- 2026-11-08T12:47:28Z · needs_input
- 2026-11-08T12:47:29Z · needs_input
- 2026-11-08T12:50:25Z · status inbox→ready
- 2026-11-08T13:10:53Z · status ready→active, branch
- 2026-11-08T13:15:50Z · body: Desired UX (added)
- 2026-11-08T13:15:50Z · message_queued at 2026-11-08T13:15:50.344Z
- 2026-11-08T13:18:17Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T13:49:13Z · body
