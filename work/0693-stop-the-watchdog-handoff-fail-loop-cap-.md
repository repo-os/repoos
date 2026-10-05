---
id: "0693"
title: "Stop the watchdog -> handoff -> fail loop: cap identical failures, restart the dead engineer with the failure text, park for a human"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T23:55:32Z"
updated_at: "2026-10-05T23:55:32Z"
---
## Problem

Task 0659 sat in a loop for hours on 2026-10-05/06: every ~6 minutes the stuck-task watchdog logged "auto-surfaced stuck task, active->review (agent crashed or was interrupted mid-turn)", the server re-ran handoff validation (a remote build that failed in ~25s every time with a deterministic type error: `StorageStatus` not exported from types.ts), the task went review->active, and 5-6 minutes later it did it again. 109 "handoff failed" entries, about 70 remote runs across three hosts, and the task file kept main dirty (blocking Move to done for every other task until commitDirty was used). No engineer ever fixed it, because no engineer was running: the agent had ended/crashed, and the failure text only reaches a LIVE engineer. The existing cap (MAX_CHECK_RETRY_ATTEMPTS = 2 in src/server/handoff.ts) covers only the engineer-resume retry path, not this watchdog -> handoff -> fail -> active cycle. The CTO also "nudged the engineer" repeatedly while nobody was listening.

## Desired UX

- A cap on watchdog auto-surface/handoff cycles for a task whose last N validation failures are identical (same failing step and error text): after N (default 2-3) stop retrying, leave the task parked as needs-human with the failure text visible on the card and in the attention queue (#0687).
- When the watchdog finds no live agent and the last failure is a deterministic gate failure, RESTART the engineer with the failure text as feedback (once, then park), instead of re-validating unchanged code.
- Skip handoff validation when the branch tip has not changed since the last identical failure.
- The CTO must not report "nudged the engineer" when no engineer session is running.
- Handoff bookkeeping lines must not be able to leave main dirty indefinitely (check the #0682 fix covers this path).

## Acceptance criteria

- Tests: three identical consecutive validation failures park the task and stop the watchdog loop; a changed branch tip re-enables validation; a dead engineer with a deterministic failure is restarted once with the failure text; CTO nudge text is not recorded without a live session.
- Docs: docs/close-out-pipeline.md or the watchdog docs updated. repoos check passes.

## Notes for AI

Overlaps #0678 (provider failures and silent runs, watchdog) and #0679 (close-out reliability): read both first, build on them, do not duplicate. Evidence: work/0659 activity log 2026-10-05T18:03Z-23:20Z and the check_runs table (task_id 0659, outcome fail, failed_step build).

## Activity

- 2026-10-05T23:55:32Z · created · unknown
