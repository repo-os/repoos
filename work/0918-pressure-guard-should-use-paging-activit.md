---
id: "0918"
title: "Pressure guard should use paging activity, not occupancy: macOS compressor share and swap used/total hold work on an idle laptop"
type: feature
status: active
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: `needs some work` — RunnerHealth drops `psiMemoryAvg10` (Runners-tab PSI is dead code) and a host-pressure fixture falls through to the rea…
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/pressure-guard-should-use-paging-activit
cli_override: codex
model_override: gpt-6-luna
review_cli_override: opencode
review_model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-10-22T04:18:52Z"
updated_at: "2026-10-22T09:44:59Z"
review_passes: 3
review_rounds: 2
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-22T09:02:53.015Z: repoos check failed: ui verification failed: a browser capture is already in flight for this task"
dev_error_count: 1
---
## Problem
2026-10-22 12:17: the pressure guard (#0871) held #0909's local close-out check and queued #0914's behind it with 'the memory compressor is holding 36% of RAM (8.6 GB) — holding new work until memory pressure eases', while the machine was idle: CPU 63% idle, and over a 20 s sample vm_stat showed ~186 pageouts (~3 MB), 9 swapins and 0 swapouts. The guard's signals are occupancy ratios: compressor share (limit 0.35) and swap used/total (limit 0.5). On macOS these are misleading: the compressor fills with cold pages from idle apps (Chrome tabs, Claude renderer) without any cost until they are touched, and swap total is dynamic (swap files are created on demand), so used/total sits high on a healthy machine (5.9 of 7 GB = 82% here). The guard therefore holds engineers, restarts and fallback checks for hours on a laptop that is not thrashing, and it makes the close-out local fallback wait on itself.

## Desired UX
The guard holds new work only when the machine is actually paying a memory cost: sustained swap-in/swap-out or pageout rates, memory_pressure reporting warn/critical, or available memory low. High but quiet occupancy shows as a warning, not a block. The Settings copy and the hold message say which signal tripped (for example 'swap in/out 4.1 MB/s over 30 s') and how to see it.

## Acceptance criteria
- macOS sampler reads vm_stat swapins/swapouts/pageouts deltas over a short rolling window and the memory_pressure level; Linux reads /proc/vmstat pswpin/pswpout deltas and PSI memory pressure where available; tests with injected samples for idle-but-full, thrashing, and recovering.
- Compressor share and swap used ratio stay as informational/warn signals only (shown in the hold message and Runners tab) and no longer block on their own; thresholds for the activity rates in pressureGuard settings with Settings controls and docs.
- The #0917 close-out fallback consults the same signal before running the full gate locally; if the laptop is actually thrashing it retries on another healthy runner and waits.
- Docs: user-docs/configuration.md pressureGuard table and docs/debugging-check-failures.md explain the new signals and why occupancy was dropped.

## Notes for AI
Start from src/core/pressure-guard.ts and resource-limits.ts (maxCompressorRatio, maxSwapUsedRatio). Evidence: the 20 s vm_stat sample (macOS, idle: ~186 pageouts, 9 swapins, 0 swapouts) and .repoos/queue-markers/0909-pressure.json. Second evidence, Linux runner: 2026-10-22 13:41 thinkpad had swap 3.5 of 4.0 GB (87%, which the Runner memory pressure banner called 'thrashing') but vmstat si/so were 0 on six consecutive 2 s samples, CPU 98% idle, and /proc/pressure/memory (PSI) was 0.00 for avg10/avg60/avg300 with 7.3 GB available. Use PSI some/full avg10 and pswpin/pswpout deltas on Linux, vm_stat swapin/swapout/pageout deltas and memory_pressure on macOS; occupancy (swap used/total, compressor share) is informational only. Related: #0871, #0900, #0901, #0917.

## Shots
```json
[
{
"label": "Pressure guard paging-activity thresholds",
"target": "default",
"route": "/settings?tab=performance",
"highlight": "[data-settings-section=\"performance\"]"
}
]
```

## Activity

- 2026-10-22T04:18:52Z · created · njachowski@gmail.com
- 2026-10-22T04:19:40Z · priority
- 2026-10-22T04:34:25Z · status inbox→ready
- 2026-10-22T04:34:40Z · cli_override
- 2026-10-22T04:34:45Z · model_override
- 2026-10-22T04:34:49Z · review_cli_override
- 2026-10-22T04:34:54Z · review_model_override
- 2026-10-22T04:35:01Z · status ready→active, branch
- 2026-10-22T04:50:31Z · message_queued at 2026-10-22T04:50:31.151Z
- 2026-10-22T04:50:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T04:55:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T05:02:23Z · body
- 2026-10-22T05:27:08Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-22T05:27:08Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Connection stalled repeatedly
- 2026-10-22T05:27:13Z · message_delivered: 1 message(s)
- 2026-10-22T05:42:14Z · body: Notes for AI (added 1, removed 1)
- 2026-10-22T05:42:14Z · message_queued at 2026-10-22T05:42:14.464Z
- 2026-10-22T07:04:41Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T07:37:23Z · body
- 2026-10-22T07:48:39Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T07:48:50Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T07:50:25Z · engineer stopped by request
- 2026-10-22T07:50:25Z · needs_input
- 2026-10-22T07:50:33Z · assigned_to
- 2026-10-22T07:57:05Z · assigned_to
- 2026-10-22T07:57:06Z · note: handoff requested (ui-review)
- 2026-10-22T08:10:18Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-10-22T08:10:19Z · status active→review
- 2026-10-22T08:22:05Z · status review→active
- 2026-10-22T08:22:14Z · note: handoff requested (ui-review)
- 2026-10-22T08:25:24Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-10-22T08:25:25Z · status active→review
- 2026-10-22T08:33:29Z · status review→active
- 2026-10-22T08:33:51Z · status active→ready
- 2026-10-22T08:33:56Z · cli_override, model_override
- 2026-10-22T08:34:19Z · status ready→active
- 2026-10-22T08:34:39Z · status active→ready
- 2026-10-22T08:34:39Z · note: task abandoned
- 2026-10-22T08:35:13Z · status ready→active
- 2026-10-22T08:39:01Z · note: handoff requested (ui-review)
- 2026-10-22T08:39:39Z · message_overdue: still queued after 60m without being delivered
- 2026-10-22T08:42:11Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-10-22T08:42:11Z · status active→review
- 2026-10-22T08:44:59Z · note: review pass 1: needs some work
- 2026-10-22T08:45:00Z · message_delivered: 1 message(s)
- 2026-10-22T08:45:00Z · status review→active
- 2026-10-22T08:50:01Z · body
- 2026-10-22T08:52:19Z · body
- 2026-10-22T08:53:14Z · note: handoff requested (ui-review)
- 2026-10-22T08:53:34Z · CTO nudge: held — handoff gate is running
- 2026-10-22T09:03:33Z · CTO nudge: held — remote validation is running
- 2026-10-22T09:04:34Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-10-22T09:04:35Z · status active→review
- 2026-10-22T09:07:09Z · note: review pass 2: needs some work
- 2026-10-22T09:07:09Z · status review→active
- 2026-10-22T09:07:11Z · CTO nudge: held — remote validation is running
- 2026-10-22T09:14:55Z · body
- 2026-10-22T09:23:33Z · message_queued at 2026-10-22T09:23:33.888Z
- 2026-10-22T09:23:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T09:24:55Z · body
- 2026-10-22T09:25:58Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T09:25:58Z · message_delivered: 1 message(s)
- 2026-10-22T09:26:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T09:26:07Z · status active→review
- 2026-10-22T09:32:01Z · note: review pass 3: needs some work
- 2026-10-22T09:32:01Z · needs_input
- 2026-10-22T09:33:10Z · assigned_to
- 2026-10-22T09:33:19Z · status review→active
- 2026-10-22T09:44:59Z · assigned_to
- 2026-10-22T09:44:59Z · note: handoff requested (ui-review)
