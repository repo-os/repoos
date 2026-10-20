---
id: "0871"
title: "Memory-pressure guard: stop starts and throttle by swap and compressor use, not load average"
type: feature
status: review
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/memory-pressure-guard-stop-starts-and-th
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T12:06:35Z"
updated_at: "2026-10-20T23:27:45Z"
---
## Problem
The pressure guard from #0836 keys off load average, which is inflated by threads waiting on a thrashing machine (load 200-500 with CPU idle near 0 and swap full on 2026-10-20), so it reacts late and tells a driver nothing about the cause. Most of the load that day was not RepoOS (Chrome helpers at 80-120% CPU, the Claude app renderer, WindowServer, a second RepoOS project on the same laptop), but RepoOS had no way to say so, and engineers simply stalled. Gates, reviews and handoffs all slowed, adding timeouts and retries.

## Desired UX
The guard uses memory pressure (swap used, compressor size, free pages / pressure level) as its primary signal, holds new engineer starts and browser steps when pressure is critical, and shows in the UI and `repoos stats` which processes use the most CPU and memory, split into RepoOS-owned (engineers, checks, previews, headless browsers) and other. It also counts engineers across all registered RepoOS servers on the machine (`repoos servers`), so two projects do not each assume they have the whole laptop.

## Acceptance criteria
- Pressure level is computed from swap and memory-compressor stats on macOS (and falls back to load average where unavailable).
- New starts are held with a visible reason when pressure is critical, then proceed automatically; running engineers are not killed.
- A panel (and `repoos stats` output) lists top CPU/memory processes, labeled RepoOS vs other.
- The concurrency cap considers all registered servers' active engineers.
- Settings UI controls for thresholds, docs, and tests with fake pressure inputs.

## Notes for AI
Builds on #0836 (caps and pressure guard) and #0853 (preview teardown). Use `vm.swapusage`, `memory_pressure` / `vm_stat` style readings through a tiny injectable probe so tests use fake values. Zero runtime dependencies; never kill processes by name.

## Shots
```json
[
{
"label": "System Resources panel with pressure banner and RepoOS-vs-other top processes",
"target": "default",
"route": "/",
"highlight": ".resource-panel",
"steps": [
{
"waitMs": 6500
}
]
},
{
"label": "Memory-pressure thresholds in Settings",
"target": "default",
"route": "/settings?tab=general&section=performance",
"highlight": "[data-settings-section=\"performance\"]"
}
]
```

## Activity

- 2026-10-20T12:06:35Z · created · njachowski@gmail.com
- 2026-10-20T22:17:49Z · status inbox→ready
- 2026-10-20T22:17:59Z · cli_override, model_override
- 2026-10-20T22:18:01Z · status ready→active, branch
- 2026-10-20T22:37:01Z · body
- 2026-10-20T22:39:36Z · body
- 2026-10-20T22:47:15Z · message_queued at 2026-10-20T22:47:15.804Z
- 2026-10-20T22:47:16Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T22:56:52Z · body
- 2026-10-20T22:59:53Z · body
- 2026-10-20T23:03:24Z · body
- 2026-10-20T23:08:58Z · body
- 2026-10-20T23:10:11Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-20T23:10:12Z · message_delivered: 1 message(s)
- 2026-10-20T23:26:39Z · status active→review
- 2026-10-20T23:26:40Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (0f734ebb5) during finalization (#0734)
- 2026-10-20T23:27:45Z · note: review pass 1: good to go
