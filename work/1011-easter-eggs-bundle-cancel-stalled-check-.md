---
id: 1011
title: "Easter eggs bundle: Cancel stalled check button flapping"
type: bug
status: active
priority: p1
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-cancel-stalled-check-
cli_override: cursor
model_override: grok-4.7-low
review_model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-02T16:01:49Z"
updated_at: "2026-11-03T17:28:17Z"
---
## Items

- E1 · "Cancel stalled check" button shows and hides every few seconds (seen on #1007 in review)
- E2 · Selected Review (and Engineer report) table row: the left accent bar overlaps the pass number

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

## E2 · Selected history row accent bar covers the pass number

### Problem
In the task drawer Review tab, the selected row of the review history table (e.g. `#8`) draws a vertical colored bar on its left edge that partly covers the pass number (see attached screenshot). The Engineer report rounds table added by #1007 uses the same row pattern and will have the same flaw.

### Desired UX
The pass/round number is fully readable on the selected row: add left padding to the first cell so the bar sits beside the text (or drop the bar and rely on the row highlight). Apply it to both the review and engineer-report tables, ideally via one shared style in `src/ui-app/src/style.css`.

### Acceptance criteria
- Selected row's first cell text is not overlapped by the bar in both tables, with no layout shift of other rows.
- Declare a shot of the Review tab (`/work?task=<id>&tab=review`) highlighting the selected row.

### Notes for AI
Find the selected-row class in the review history table (grep TaskDrawer.vue / style.css for the row selected style). If #1007 has not landed yet, cover the report table once it is on main.

## Screenshots

![Selected review row: accent bar overlaps #8](/api/tasks/1011/attachments/att_7bb17e23-df1b-45f2-8cc8-a7e128aad7db.png)

## Activity

- 2026-11-02T16:01:49Z · created · njachowski@gmail.com
- 2026-11-02T16:06:24Z · body: Items (added 1); E2 · Selected history row accent bar covers the pass number (added)
- 2026-11-02T16:06:26Z · screenshots
- 2026-11-03T17:02:04Z · status inbox→ready
- 2026-11-03T17:02:20Z · cli_override
- 2026-11-03T17:02:21Z · cli_override
- 2026-11-03T17:02:23Z · model_override
- 2026-11-03T17:02:36Z · review_model_override
- 2026-11-03T17:03:05Z · priority
- 2026-11-03T17:28:17Z · status ready→active, branch
