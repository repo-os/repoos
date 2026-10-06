---
id: "0693"
title: "Stop the watchdog -> handoff -> fail loop: cap identical failures, restart the dead engineer with the failure text, park for a human"
type: bug
status: review
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/stop-the-watchdog-handoff-fail-loop-cap-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T23:55:32Z"
updated_at: "2026-10-06T02:40:39Z"
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

## Driver note: CTO overrides an explicit pause
2026-10-06 08:09 the driver PAUSED tasks 0680 and 0675 to relieve a load average of 86 (swap nearly full). Within about 5 minutes the CTO logged 'CTO nudge: sent engineer a completion reminder after 5m without worktree activity' on both and they were running again (agents/running showed both). A paused task must be exempt from CTO nudges, watchdog auto-surface and any auto-start until explicitly resumed.

## Activity

- 2026-10-05T23:55:32Z · created · unknown
- 2026-10-05T23:55:48Z · story
- 2026-10-06T00:16:18Z · body: section Driver note: CTO overrides an explicit pause
- 2026-10-06T01:49:22Z · status inbox→ready
- 2026-10-06T01:49:23Z · cli_override, model_override
- 2026-10-06T01:49:23Z · status ready→active, branch
- 2026-10-06T02:05:47Z · body
- 2026-10-06T02:39:14Z · body
- 2026-10-06T02:40:39Z · status active→review
