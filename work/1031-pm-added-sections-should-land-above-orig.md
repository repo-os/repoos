---
id: 1031
title: PM-added sections should land above Original prompt and Screenshots
type: bug
status: done
priority: p2
area: core
merged_commit: 1ee7cea95a2f0eea5eadc9c396409dba4ceaa200
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/pm-added-sections-should-land-above-orig
model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-04T12:03:10Z"
updated_at: "2026-11-04T19:44:39Z"
last_close_out_gate_ms: 522845
last_close_out_gate_at: "2026-11-04T19:43:21.457Z"
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem

`replaceSection` (src/core/task.ts) inserts a brand-new `## Heading` immediately before `## Activity`. On a freeform task the body is: raw prompt, `## Original prompt`, `## Screenshots`, `## Activity`. So when the PM agent adds Problem / Desired UX / Acceptance criteria / Notes for AI, they land BELOW the long Original prompt and screenshots and the user scrolling the task panel thinks nothing was fleshed out (seen on #1030, 2026-11-04).

## Desired behaviour

A newly created section (any heading other than Original prompt, Screenshots, Activity) is inserted before the first of `## Original prompt` / `## Screenshots` / `## Activity` that exists, so the fleshed-out spec reads first and the raw capture + images sit at the bottom. Re-replacing an existing section stays in place. Sections added one at a time keep their order (Problem, Desired UX, Acceptance criteria, Notes for AI).

## Acceptance criteria

1. Unit tests in the replaceSection suite: new section lands above Original prompt/Screenshots; sequential adds keep order; existing section replaced in place; body with only Activity behaves as today.
2. Existing tests pass; no change to how Original prompt / Screenshots / Activity themselves are placed.

## Notes for AI

Change is in `replaceSection` (insertAt computation). Also check the PM prompt in src/server/freeform.ts does not assume the old order.

## Activity

- 2026-11-04T12:03:10Z · created · njachowski@gmail.com
- 2026-11-04T17:44:20Z · model_override
- 2026-11-04T17:44:27Z · status inbox→ready
- 2026-11-04T18:18:32Z · status ready→active, branch
- 2026-11-04T18:29:16Z · message_queued at 2026-11-04T18:29:16.827Z
- 2026-11-04T18:29:17Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T18:29:30Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T18:31:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Implementation is complete and verified so far; the scoped check is still running in the background. **Status:** - **Fix** (`src/core/task.ts:282-314`): `replaceSection` now inserts a brand-new spec section before the first of `## Original… · stderr: (empty)
- 2026-11-04T18:35:54Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T18:41:10Z · message_delivered: 1 message(s)
- 2026-11-04T18:42:05Z · message_queued at 2026-11-04T18:42:05.900Z
- 2026-11-04T18:42:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T18:43:32Z · body
- 2026-11-04T18:47:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T18:48:48Z · note: adopted orphaned engineer pid 52394
- 2026-11-04T18:50:51Z · body
- 2026-11-04T18:53:42Z · CTO nudge: held — handoff gate is running
- 2026-11-04T19:09:00Z · status active→review
- 2026-11-04T19:09:00Z · message_queued at 2026-11-04T19:09:00.565Z
- 2026-11-04T19:09:00Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-04T19:09:47Z · note: review pass 1: good to go
- 2026-11-04T19:43:21Z · close-out gate completed in 523s
- 2026-11-04T19:44:39Z · status done→done, release:success
