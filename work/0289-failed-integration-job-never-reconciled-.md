---
updated_at: "2026-08-24T21:59:47Z"
review_passes: 1
id: "0289"
title: Failed integration job never reconciled against an already-done task
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/failed-integration-job-never-reconciled-
created_at: "2026-08-24T21:35:57Z"
---
## Problem
When a duplicate/stale close-out job gets enqueued against a task that already finished successfully through an earlier job (e.g. a duplicate "Move to done" trigger firing after the board hadn't yet caught up — see #0285), the resulting failure is never reconciled against the task's actual, already-`done` state. Two separate pieces of dead state persist indefinitely with nothing to clean them up:

1. **Server-side:** `.repoos/integration-jobs/<id>.json` keeps the `phase: "failed"` record forever — nothing checks "is this task already done via a different job?" and retires/archives it.
2. **Client-side:** the browser's `doneErrors` map (src/ui-app/src/stores/repo.ts:287) gets set from the `integration` SSE failure event (repo.ts:733, `setDoneError(e.id, describeCloseOutFailure(...))`) with no check against the task's current status. It only ever gets cleared by a LATER `task.updated` event with `status !== "review"` (repo.ts:590) — but a task that's already `done` and staying `done` will never emit another such transition, so the stale error is permanent for that browser tab until a manual page reload (which drops the in-memory state entirely, since it's never rehydrated from the server).

## Confirmed live
Task #0270: closed out successfully at 2026-08-24T21:18:47Z (`status: done`, merged to `main`, reviewer verdict "good to go"). A redundant close-out job was enqueued 90 seconds later at 21:20:15Z — almost certainly the #0285 board-staleness bug causing a duplicate Move-to-done trigger — and instantly failed with `"feature branch feat/highlight-the-move-to-done-button-when-r worktree not found"` (correct: cleanup had already deleted it as part of the successful first close-out). That failure is real and expected GIVEN the duplicate trigger, but nothing downstream recognizes "this task already succeeded, this failure is moot" — the failed job file sits there forever, and the client shows a permanent, misleading error badge on an already-finished task until someone happens to reload the page.

## Fix directions
- **Server side:** when a close-out job fails specifically because the task's own worktree/branch is gone (or more generally, whenever a job fails for a task whose current status is already `done`), check whether that task is already `done` before persisting/surfacing the failure as actionable. If it's already done, archive or drop the job record instead of leaving a permanent `failed` phase — this is a reconciliation/moot-failure case, not a real gate failure needing a human's attention.
- **Client side:** `setDoneError` (or its call site at repo.ts:733) should check the task's current status before setting an error — don't surface a close-out failure for a task that's already `done`. Alternatively/additionally, rehydrate `doneErrors` from server state on reconnect (today it isn't — it's pure in-memory SSE-event state) so a stale error can't outlive a page reload in the wrong direction either.
- Consider a periodic sweep (or a check triggered whenever a job fails) that reconciles ANY failed job against its task's current status generally, not just this specific worktree-not-found case — the same class of staleness could show up from other failure reasons if a duplicate/stale job gets queued for other reasons.

## Acceptance criteria
- A close-out job that fails against a task already `done` does not leave a permanent error badge in the UI, and does not leave an indefinite `failed` job file with no path to resolution.
- A genuine close-out failure against a task that is NOT done (the normal case) is completely unaffected — still surfaces clearly, still actionable, still requires human attention.
- `repoos check` green.

## Related
- #0285 — the board-staleness bug that most likely causes the duplicate trigger in the first place; fixing #0285 reduces how often this happens, but doesn't eliminate the need for reconciliation (a duplicate/stale job could still occur from other timing issues).
- #0270 — the live example this was found on.

## Activity

- 2026-08-24T21:35:57Z · created · unknown
- 2026-08-24T21:47:21Z · status inbox→ready
- 2026-08-24T21:47:27Z · status ready→active, branch
- 2026-08-24T21:56:58Z · status active→review

