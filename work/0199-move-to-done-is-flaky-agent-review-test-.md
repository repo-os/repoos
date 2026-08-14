---
id: "0199"
title: "Move-to-done is flaky: agent-review test race fails repoos check ~2/3 of runs and the async close-out failure never surfaces in the UI"
type: bug
status: review
needs_merge: true
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/fix-flaky-agent-review-test-and-surf
created_at: "2026-08-14T13:02:27Z"
updated_at: "2026-08-14T13:11:04Z"
---
## Problem

The "Move to done" flow was effectively broken: `repoos check` (the close-out gate) failed nondeterministically, so most tasks never reached done, and when it did fail the UI showed nothing.

Two compounding issues:

1. **Flaky test** — `src/ui-app/tests/agent-review.test.ts` > "rejects move-to-done while automatic review is still running" raced its 500ms fixture reviewer. Under full-suite parallel load the review could finish between the `/review` poll and the `/api/index` read, flipping `running` to false and failing the assertion. Reproduced 2-of-3 failing runs on a clean candidate; 6 of 9 prior close-outs (0169/0177/0180/0184/0189/0196) died at this gate.

2. **Invisible failures** — `POST /api/tasks/:id/done` only enqueues a background job and returns immediately, so a later close-out failure was recorded only in `.repoos/integration-jobs/<id>.json` (reason kept just bun's generic `error: script "repoos" exited with code 1`, discarding the real cause).

## Fix

- **`agent-review.test.ts`**: fixture reviewer now lives 3s, and the test polls `/api/index` until it reports `running: true` (async loop, 10s deadline) instead of asserting once after a side-channel poll. Removes the race rather than shrinking it; the 409-guard assertions still verify done cannot interrupt an in-flight review.
- **`integration-orchestrator.ts`**: `tailLine` now keeps the last 15 lines (≤800 chars) of failed output, so the recorded reason shows the actual failing test / compile error instead of bun's wrapper.
- **`server.ts`**: when a job lands in the terminal `failed` phase, emit a `task.progress` SSE event with `step: "failed"` and the real reason (skipped for "main advanced, revalidating" — that's a retry).
- **UI** (`live-index.ts` / `types.ts` event types + `repo.ts` store): a `task.progress` `failed` event surfaces as the inline done-error card the TaskCard/TaskDrawer already render.

## Verification

- `bun run test` full suite ×2: 585 passed / 1 skipped / 49 files.
- Flaky test alone ×6: all green (~3.5s each).
- `repoos check` fully green in worktree (staleness, lockfile-sync, build, css-layers, theme-contrast, tests; ui-smoke skipped — webkit not installed).

## Follow-ups

- Retry "Move to done" on #0196 (its close-out failed on this same gate; the fix content is ready and waiting).

## Activity

- 2026-08-14T13:11:01Z · body
- 2026-08-14T13:11:04Z · status ready→review
- 2026-08-14T13:11:04Z · needs_merge
