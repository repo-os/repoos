---
id: "0918"
title: "Pressure guard should use paging activity, not occupancy: macOS compressor share and swap used/total hold work on an idle laptop"
type: feature
status: ready
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: cursor
created_at: "2026-10-22T04:18:52Z"
updated_at: "2026-10-22T04:34:40Z"
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
Start from src/core/pressure-guard.ts and resource-limits.ts (maxCompressorRatio, maxSwapUsedRatio). Evidence: the 20 s vm_stat sample above and .repoos/queue-markers/0909-pressure.json. Related: #0871, #0900, #0901, #0917.

## Activity

- 2026-10-22T04:18:52Z · created · njachowski@gmail.com
- 2026-10-22T04:19:40Z · priority
- 2026-10-22T04:34:25Z · status inbox→ready
- 2026-10-22T04:34:40Z · cli_override
