---
id: 1011
title: "Easter eggs bundle: Cancel stalled check button flapping"
type: bug
status: inbox
priority: p3
area: [web, core]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-02T16:01:49Z"
updated_at: "2026-11-02T16:01:49Z"
---
## Items

- E1 · "Cancel stalled check" button shows and hides every few seconds (seen on #1007 in review)

## E1 · Cancel stalled check flaps

### Problem
On a task in review, the "Cancel stalled check" button on the task card/drawer appears and disappears every few seconds. Stalled is decided by `isCheckHeartbeatStalled` (`src/core/active-task-card.ts`): no valid `lastProgressAt` or idle >= 3 min (`DEFAULT_CHECK_STALL_MS`). The client updates `lastProgressAt` only on `task-check.start`/`task-check.output` SSE events (`src/ui-app/src/stores/repo.ts` ~1945-1965). Suspects: heartbeat missing/null from the server snapshot vs SSE (fail-closed makes it stalled), two sources overwriting each other, or sparse output hovering around the 3 minute threshold.

### Desired UX
The button shows only when the check has truly had no heartbeat for the threshold, and stays stable otherwise (no flicker). Hysteresis or a single heartbeat source of truth is fine.

### Acceptance criteria
- Reproduce with a test: alternating snapshot/SSE updates for a running check must not toggle the stalled state while the check is actually progressing.
- A genuinely stalled check still shows the button and `/api/tasks/:id/cancel-check` still gates on the same rule.

### Notes for AI
Narrow the root cause first (snapshot `lastProgressAt` null on refetch vs SSE). Keep client and server stall rules aligned.

## Activity

- 2026-11-02T16:01:49Z · created · njachowski@gmail.com
