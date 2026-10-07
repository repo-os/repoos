---
updated_at: "2026-10-07T04:45:19Z"
review_passes: 1
id: "0733"
title: Show review records in a table
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-review-records-in-a-table
created_at: "2026-10-07T02:52:02Z"
last_check_failure: "repoos check at 2026-10-07T04:21:52.308Z: server-side finalization timed out (deadline exceeded)"
dev_error_count: 1
---
## Problem

The report records section is useful, but its current presentation is not as clear as the simple table on the Tokens page. Review records also need to be ordered with the latest review first, avoid showing the most recent review data twice, and identify the coding agent and model used for each review run.

## Desired UX

Show review records in a simple table styled consistently with the Tokens page. List the latest review first, show each review's data only once, and include the reviewer coding agent and model for every run.

## Acceptance criteria

- [ ] Review records are displayed in a simple table consistent with the Tokens page style.
- [ ] Records are ordered from latest review to oldest.
- [ ] The most recent review's data appears only once.
- [ ] Each review record shows the reviewer coding agent and model.

## Notes for AI

- Follow the existing Tokens page table style rather than introducing a new visual treatment.
- Use the existing review record data; do not add unrelated fields or behavior.
- Assume “most recent review data” refers to the latest review appearing in the records section, not a separate summary elsewhere.

## Scope

This task covers the presentation, ordering, and per-run reviewer/model information in the report records section.

## Original prompt

This new report records section is useful but let's make it a proper table , like on the tokens page (that style is good, simple) . but re-order so the latest review is at the top (and don't duplicate the most recent review data, just show each once). also show the reviewer coding agent + model for each run.

## Shots
```json
[]
```

## Screenshots

![Screenshot-2026-10-07-at-10.49.17](/api/tasks/0733/attachments/screenshot-1.png)

## Activity

- 2026-10-07T02:52:02Z · created · hello@repoos.org
- 2026-10-07T02:52:04Z · screenshots
- 2026-10-07T02:52:23Z · status draft→inbox, title, area, body
- 2026-10-07T02:58:15Z · status inbox→ready
- 2026-10-07T02:58:15Z · status ready→active, branch
- 2026-10-07T03:03:54Z · body
- 2026-10-07T03:04:53Z · body
- 2026-10-07T03:08:03Z · body
- 2026-10-07T03:09:53Z · body
- 2026-10-07T03:11:12Z · body
- 2026-10-07T03:11:53Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-07T03:17:20Z · needs_input
- 2026-10-07T03:33:35Z · body
- 2026-10-07T03:34:46Z · body: section Shots
- 2026-10-07T03:39:59Z · body
- 2026-10-07T03:40:02Z · note: highlight .review-history-table matched nothing on /work?task=0733
- 2026-10-07T03:40:29Z · body: section Shots
- 2026-10-07T03:40:50Z · note: highlight .review-history-table matched nothing on /work?task=0679
- 2026-10-07T03:41:29Z · note: shot removed: Task drawer Review tab: review records table (pass, when, reviewer, model, verdict)
- 2026-10-07T03:41:29Z · body: section Shots
- 2026-10-07T03:41:29Z · note: shot removed: Review records table on #0679 with real review history, newest pass first
- 2026-10-07T03:41:31Z · note: Driver verification: stopped a redundant scoped check after an unchanged tree had already passed (thinkpad48s/local24s, subsequent bee300s also gate exit0). No live engineer and clean source tree before repoos review request. Inspected diff: descending pass sort, one table row per pass, stored agent/cli/model fields and legacy-empty fallback tests. UI evidence remains incomplete: sanctioned preview uses branch-local review cache; both task0733 and existing0679 show No agent review yet, so table highlight did not match. Deleted those misleading captures via API; do not accept them as evidence. Reviewer must verify table rendering with genuine review records, including latest-first, reviewer/model and narrow-width layout before approval. No fabricated records, source edits, config/host changes or review-blocker overrides.
- 2026-10-07T03:51:08Z · handoff failed · ui-review handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-07T03:56:58Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-07T03:57:44Z · body
- 2026-10-07T03:58:11Z · note: Driver03:57: message rejected agent busy; preserve this for next turn/reviewer. Full handoff bee353s failed agent-review.test.ts second-review counter wait; fallback thinkpad325s failed done-guard-orchestrator.test.ts merged_commit from job.branchSha (#0711). Main log .repoos/logs/remote-validation/0733.log holds both. Independently compare current-main baseline before blaming this five-file diff; do not weaken assertions or blindly repeat unchanged checks. #0679 now landed e158ff714, buildhash434e1e974 version0.5.66. Visual table evidence still missing because branch preview lacks real review history; no fabricated production cache/task data. Verify genuine table latest-first, once per pass, agent/model and narrow width through sanctioned preview or meaningful rendering test. Stay existing task/worktree; no config/host changes.
- 2026-10-07T03:59:01Z · body
- 2026-10-07T04:00:24Z · body
- 2026-10-07T04:31:26Z · body
- 2026-10-07T04:33:27Z · body
- 2026-10-07T04:34:38Z · body
- 2026-10-07T04:44:23Z · status active→review
- 2026-10-07T04:44:23Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-07T04:45:19Z · note: review pass 1: good to go

