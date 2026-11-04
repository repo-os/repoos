---
id: 1029
title: Indexer warns 'skipped 1 task file with no id' for work/reports/<id>/review-<n>.md
type: bug
status: active
priority: p3
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/indexer-warns-skipped-1-task-file-with-n
created_at: "2026-11-04T07:06:29Z"
updated_at: "2026-11-04T07:40:52Z"
handoff_signal_retry_count: 2
---
## Problem
Every `repoos` command prints "[repoos] skipped 1 task file(s) with no `id` in frontmatter — use the API…". The cause is `work/reports/1014/review-1.md`, the first committed review report (d2f5c0020). `walkFiles` in `src/core/indexer.ts` (around line 39) walks `work/` recursively for `.md` files, so the report is read as a task file, has no `id`, and trips the warning at lines 122 and 207. Every future review pass under `work/reports/<id>/` adds to the count.

## Desired UX
Reports are bookkeeping, not tasks. The indexer ignores them and the warning appears only for a genuinely hand-written task file.

## Acceptance criteria
- `buildIndex` skips the reports directory (use `reportsWorkDir`/`report-paths.ts` rather than a hard-coded name) and does not count its files as skipped task files.
- A hand-written `work/*.md` with no `id` still triggers the warning.
- A test covers both: a `work/reports/<id>/review-1.md` is silent, and an id-less task file still warns.
- `repoos list` prints no skipped-file warning on this repo.

## Notes for AI
Small, independent fix in `src/core/indexer.ts` plus a test. Do not change the report file format or location.

## Activity

- 2026-11-04T07:06:29Z · created · njachowski@gmail.com
- 2026-11-04T07:06:32Z · status inbox→ready
- 2026-11-04T07:06:35Z · status ready→active, branch
- 2026-11-04T07:11:46Z · message_queued at 2026-11-04T07:11:46.522Z
- 2026-11-04T07:17:01Z · message_queued at 2026-11-04T07:17:01.567Z
- 2026-11-04T07:22:46Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T07:38:30Z · body
- 2026-11-04T07:40:52Z · handoff_deferred: 2 queued message(s) must be read before review
