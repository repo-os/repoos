---
id: "0923"
title: repoos gc must spare the candidate worktree of a running close-out
type: bug
status: inbox
priority: p1
area: core
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T06:06:09Z"
updated_at: "2026-10-22T06:06:09Z"
---
## Problem
The CLI `repoos gc` (src/commands/gc.ts cmdGc) calls sweepStaleWorktrees without `activeJobIds`, so src/core/worktree-gc.ts removes every repoos/integrate/<id> candidate worktree, including one whose close-out is queued, running or recovering. Only the boot sweep passes activeJobIds. Incident 2026-10-22: Nick ran `repoos gc` while #0909's close-out was validating; its candidate worktree was deleted under the running test step, leaving an orphaned check process and a close-out that could never finish until it was cancelled.

## Desired UX
Every caller of the sweep (CLI gc, API, boot) spares candidates with a live integration job (read .repoos/integration-jobs, phases queued/syncing/validating/publishing). gc prints 'kept: close-out job still active'. The task's own feature worktree is never affected.

## Acceptance criteria
- A test: a job in validating phase for <id> means gc (default, --yes and --dry-run) keeps repoos/integrate/<id>.
- A finished or failed job's candidate is still removed.

## Notes for AI
Derive activeJobIds inside sweepStaleWorktrees when the caller omits it, so no caller can forget it.

## Activity

- 2026-10-22T06:06:09Z · created · njachowski@gmail.com
