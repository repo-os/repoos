---
id: "1108"
title: "Auto-recover idle tasks: failed review pass and undelivered engineer message leave a task stuck for an hour"
type: feature
status: active
priority: p2
area: [server, core]
assigned_to: ai
created_by: t@t
branch: feat/auto-recover-idle-tasks-failed-review-pa
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T08:27:35Z"
updated_at: "2026-11-14T08:53:46Z"
handoff_signal_retry_count: 1
---
## Problem
On 2026-11-14 two tasks sat idle until a human noticed:
1. #1106: review pass 1 failed with "no usable report" (an agent error, not a verdict). The task went to needs_input and waited about an hour for a manual `repoos review again`.
2. #1103 (and later #1106): after "review pass 2: needs some work" the engineer message was queued ("message_overdue: still queued after 60m without being delivered") and no engineer was running. The task stayed in review with no one working on it until a manual `review again`.
The board showed these as "review" with no clear sign that nothing was happening.

## Desired UX
A failed review pass (agent error, no usable report) is retried automatically a bounded number of times (for example 2) before it asks for human input. When a review sends a task back for fixes and the queued message is not delivered within a few minutes because no engineer is running, RepoOS restarts the engineer on the same worktree. After the bounds are exhausted the card says exactly what is stuck and why, not just "review".

## Acceptance criteria
1. A review pass that ends with "failed — no usable report" triggers an automatic retry up to a configurable bound, each retry logged in task activity; after the bound the task shows needs_input with the reason.
2. A queued engineer message older than a configurable threshold with no live engineer restarts the engineer (respecting hold, pause, assigned_to human and the pressure guard) and logs it.
3. Neither path fires for held, paused or human-assigned tasks; tests cover each exclusion.
4. Settings UI controls for the new settings per AGENTS.md (getConfigSchema + Settings tab, with a test).
5. Documented in docs/ and user-docs/.

## Notes for AI
Start from src/server/task-watchdog.ts and the review pipeline in src/server/agent-review*.ts; the watchdog already handles stuck engineers (see #0888). Do not widen it to act on tasks in closing-out. Every LLM call site must keep recording usage.

## Activity

- 2026-11-14T08:27:35Z · created · t@t
- 2026-11-14T08:27:40Z · cli_override, model_override
- 2026-11-14T08:27:41Z · status inbox→ready
- 2026-11-14T08:27:42Z · status ready→active, branch
- 2026-11-14T08:30:00Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I couldn’t complete Task #1108 in this turn. I inspected the existing watchdog and review flow, but made no implementation changes and did not write the engineering report draft. The required `REPOOS_CHECK_CHANGED=main repoos check` has no… · stderr: Reading additional input from stdin... 2026-11-14T08:28:08.367080Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out 2026-11-14T08:28:08.397521Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out 2026-11-14T08:29:56.132208Z ERROR codex_co…
- 2026-11-14T08:48:46Z · message_queued at 2026-11-14T08:48:46.398Z
- 2026-11-14T08:48:46Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T08:51:36Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T08:51:50Z · note: adopted orphaned engineer pid 3428
- 2026-11-14T08:53:46Z · body
