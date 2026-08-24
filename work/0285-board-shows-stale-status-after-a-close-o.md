---
id: "0285"
title: Board shows stale status after a close-out's server reload handoff
type: bug
status: active
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: feat/board-shows-stale-status-after-a-close-o
created_at: "2026-08-24T20:48:22Z"
updated_at: "2026-08-24T21:06:09Z"
---
## Problem
After a task's close-out (`review → done`) completes, the UI board can keep showing the task in its old column (e.g. still `review`) even though the task file and `main` are already correctly updated — until the user does something that forces a fresh fetch (like opening the task drawer), at which point it snaps to the correct column.

Confirmed live with #0273: server log shows the close-out finished and flipped status at 04:40:25 ("Sending notification for 0273: review → done", "updated #0273 → done"), but the board kept showing it in Review. Opening the task drawer at ~04:43:49 triggered a second, redundant `review → done` transition log line and only then did the card move.

## Likely root cause
`publishCandidate()` (src/server/integration-orchestrator.ts) rebuilds `dist/` on `main` mid-close-out while holding the close-out lock — exactly the trigger documented in docs/close-out-pipeline.md under "The reload-churn interaction": it trips the server's own auto-reload (src/server/reload.ts) into spawning a replacement process right as the job finishes.

Since #0271, the replacement no longer blocks `listen()` on a full synchronous reindex — `refreshAllAsync()` rebuilds the in-memory task index in the background after the replacement is already accepting connections. The frontend's `EventSource.onopen` handler (src/ui-app/src/stores/repo.ts:829-866) does call `refresh()` (`GET /api/board`) on every SSE reconnect specifically to catch state missed during the gap:

```js
void refresh().catch(() => {
  /* connection state already reflects the successful SSE open */
});
```

But this is fire-and-forget with no retry. If the browser's EventSource reconnects to the brand-new replacement process and `refresh()` fires before `refreshAllAsync()` finishes rebuilding the index, the board snapshot returned is stale/partial — and since the fetch doesn't throw, nothing ever retries or corrects it. The card is then stuck wrong until some other event nudges a refetch (a later SSE event, or the drawer's own `fetchTask` call, which reads the canonical file directly rather than the cached board).

## Fix directions to investigate
- Server side: make `GET /api/board` (or whatever backs it) block until `refreshAllAsync()` for that boot has actually completed, rather than answering against a partially-built index. Or expose a readiness signal the client can wait on.
- Client side: `es.onopen`'s `refresh()` in src/ui-app/src/stores/repo.ts should not silently swallow a stale/incomplete response — either retry with backoff, or reconcile against a per-task version/updated_at so a subsequent event (or a short poll) can correct a stale card without requiring the user to manually reopen it.
- Consider whether `es.onopen` should wait for the `hello` SSE frame (which presumably fires once the new process's index is actually ready) before calling `refresh()`, instead of firing immediately on TCP connect.

## Acceptance criteria
- Reproduce a close-out that triggers a reload handoff (or simulate the timing) and confirm the board updates to the task's true final status without requiring any user interaction beyond having the board open.
- No change to the close-out pipeline's correctness (task file / main state) — this is purely about the live view catching up reliably.

## Related
- docs/close-out-pipeline.md — "The reload-churn interaction" section, #0271
- #0277 — a related but distinct live-index gap (bumpReviewPasses not emitting task.updated), already fixed on that branch

## Activity

- 2026-08-24T21:03:31Z · body
- 2026-08-24T21:05:24Z · status inbox→ready
- 2026-08-24T21:05:28Z · pm_model_override
- 2026-08-24T21:05:53Z · pm_model_override
- 2026-08-24T21:05:58Z · model_override
- 2026-08-24T21:06:09Z · status ready→active, branch
