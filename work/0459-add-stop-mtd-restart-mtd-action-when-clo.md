---
id: "0459"
title: Add Stop MTD / Restart MTD action when close-out is in progress
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-stop-mtd-restart-mtd-action-when-clo
created_at: "2026-09-20T00:11:42Z"
updated_at: "2026-09-20T01:51:42Z"
---
## Problem

Once a task enters the MTD pipeline (shown as 'Moving to done…' on the card), there is no way to cancel or restart it. If the pipeline gets stuck — a flaky check, a merge conflict, a test timeout — the only option is to wait it out. There is no escape hatch to abort and retry.

## Desired behaviour

When a task is in the MTD pipeline (the 'Moving to done…' card state, i.e. `inPipeline` is true), show a **Stop MTD** button in the task drawer. Clicking it:

1. Cancels the in-flight close-out.
2. Returns the task to `review` status so the user can inspect what went wrong and click MTD again.

Optionally, a **Restart MTD** variant could re-queue immediately without going back to `review`, but Stop + manual re-click is the simpler, safer default.

## Implementation notes

- The pipeline state is tracked server-side. A `POST /api/tasks/:id/done/cancel` (or similar) endpoint is needed to abort and revert.
- The card already has the `inPipeline` computed — the Stop button should appear in the drawer when that is true, alongside (or replacing) the normal 'Move to done' button.
- The card's 'Moving to done…' hint can stay as-is; the control point is in the drawer.
- Consider what happens to the worktree/branch if the pipeline is cancelled mid-merge — the revert should leave the branch intact and uncommitted so nothing is lost.

## Activity

- 2026-09-20T00:11:42Z · created · unknown
- 2026-09-20T00:12:22Z · status inbox→ready
- 2026-09-20T00:50:49Z · status ready→active, branch
- 2026-09-20T01:17:08Z · status active→review
- 2026-09-20T01:51:42Z · status review→done, release:success
