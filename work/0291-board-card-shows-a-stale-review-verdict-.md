---
id: "0291"
title: Board card shows a stale review verdict after a missed SSE event during reload
type: bug
status: review
needs_input: true
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: feat/board-card-shows-a-stale-review-verdict-
model_override: default
pm_model_override: default
created_at: "2026-08-24T21:52:07Z"
updated_at: "2026-08-25T05:05:22Z"
---
## Problem
The board card's review-verdict badge can show an outdated verdict (e.g. "needs some work" from an earlier round) even though the actual, current review report already says something different (e.g. "good to go" from the latest round) — confirmed live on #0286 itself.

## Root cause
When a review completes, the server emits a `review` SSE event; the client's handler (src/ui-app/src/stores/repo.ts:757-781) correctly calls `loadReview(e.id)` on completion (state `"ready"`/`"failed"`) to pull the authoritative fresh report. That part is correct.

But if that specific SSE event is dropped — e.g. because the server's frequent reload-churn (see #0288's investigation: the server has been self-reloading roughly every 1-3 minutes this session) closes the connection right as a review round finishes — the event is lost. Per the app's own documented EventSource behavior, "events emitted while EventSource reconnects are not replayed," so `loadReview` never fires for that round.

The reconnect-recovery path (`refresh()`, called from `es.onopen`) is supposed to catch exactly this kind of gap, but for reviews specifically it deliberately skips reconciling the report (src/ui-app/src/stores/repo.ts:903-913):
```js
// Index hydration is the recovery path after reconnecting while a review
// was running. Reports remain lazy-loaded by the drawer, but cards get
// their live activity state immediately.
...
report: reviews.value[task.id]?.report ?? null,
```
It explicitly carries forward the existing client-side cached report rather than refetching, on the assumption the drawer will lazy-load a fresh one whenever it's opened. That assumption holds for the drawer (its own watcher calls `loadReview` on open — confirmed correct), but NOT for the board card's own verdict badge, which reads the same `reviews.value[id]` cache directly and never forces a fetch. So a missed completion event during a reload gap leaves the card showing a stale verdict indefinitely — it only ever corrects if a LATER review event happens to be received successfully, or the user opens the drawer (which force-refreshes and makes the mismatch visible/confusing, exactly as reported: report says X, card says Y).

## Confirmed live
Task #0286 went through 3 review rounds (2026-08-24T21:31-21:33, 21:36-21:38, 21:41-21:43Z). The currently stored `.repoos/reviews/0286.md` — the authoritative latest report — says "good to go." The board was observed showing "needs some work," an earlier round's verdict, consistent with that round's completion SSE event being dropped during one of the server's frequent reload handoffs in between.

## Fix directions
- `refresh()`'s review hydration (repo.ts:903-916) should not blindly trust the existing cached `report`. Either: (a) always re-fetch the review state for any task in `review` status on reconnect (bounded — only for tasks currently in review, not the whole history), or (b) compare a cheap freshness signal (report timestamp / `review_passes` count, now available per #0277's fix) against what's cached and only skip the refetch when they match.
- This is the same class of gap as #0285 (task status/board staleness after a missed reload-era SSE event) and #0289 (stale done-error badge) — consider whether a single shared reconciliation mechanism (e.g., a lightweight "does the client's cached state match the server's current state" check per visible task, run on every reconnect) is worth building once instead of patching each cache (status, doneError, review report) separately. Flag this scope question rather than deciding it unilaterally — a shared fix could be a bigger, separate refactor.

## Acceptance criteria
- After a review completes and its SSE completion event is missed (simulate: disconnect/reconnect the SSE connection right as a review finishes, or force a reload mid-review), the board card's verdict badge matches the actual latest report on the next reconnect — no user action (like opening the drawer) required to correct it.
- No regression to the drawer's existing lazy-load behavior.
- `repoos check` green.

## Related
- #0285 — task-status board staleness after a close-out's reload handoff; same root mechanism (missed SSE event during frequent reload-churn), different cache.
- #0289 — stale done-error badge; same root mechanism, different cache.
- #0288 — the reload-churn frequency itself (reviewer not reload-durable) that makes this collision likely; even after #0288 lands, the SSE-gap-during-reload scenario can still occur from ordinary reload handoffs, so this fix is needed independently.
- #0277 — added `review_passes`, which may be useful as the freshness signal for reconciliation.

## Activity

- 2026-08-24T21:52:07Z · created · unknown
- 2026-08-24T22:05:17Z · status inbox→ready
- 2026-08-24T22:05:24Z · status ready→active, branch
- 2026-08-24T22:16:17Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-08-24T23:35:26Z · pm_model_override
- 2026-08-24T23:35:31Z · pm_model_override
- 2026-08-24T23:35:38Z · status active→review
- 2026-08-25T00:03:29Z · review_model_override
- 2026-08-25T00:03:29Z · model_override
- 2026-08-25T00:58:35Z · pm_model_override
- 2026-08-25T00:59:28Z · pm_model_override
- 2026-08-25T05:02:07Z · pm_model_override
- 2026-08-25T05:05:22Z · review_model_override
