---
id: "0955"
title: Profile and reduce /api/deployments latency from git subprocess fan-out
type: bug
status: active
hold: true
hold_reason: "Driver landing by hand: handoff check timed out under load (Nick, 2026-10-29)"
hold_by: driver
hold_at: "2026-10-29T05:44:28.394Z"
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/profile-and-reduce-api-deployments-laten
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-25T00:08:04Z"
updated_at: "2026-10-29T05:44:28Z"
---
The driver measured /api/deployments at a 2687 ms median (5 runs; 2279–3000 ms), while /api/project-environments was 1 ms, /api/dev/targets 1 ms, /api/check-plan 5 ms, and /api/releases 0 ms. Inspect and profile getDeploymentsStatus in src/server/deployments.ts to identify the expensive operation(s). The handler fans out git subprocesses for branch summaries and per-row freshness/subdirectory comparisons; much is already Promise.all, so verify the actual bottleneck before changing behavior. Reduce latency safely (for example, coalesce repeated git queries or cache results by checkout HEAD for a short window), add coverage for invalidation and concurrent requests, and record five-run before/after medians.

## Activity

- 2026-10-25T00:08:04Z · created · njachowski@gmail.com
- 2026-10-25T00:08:11Z · needs_input
- 2026-10-29T04:30:25Z · cli_override, model_override
- 2026-10-29T04:30:47Z · status inbox→ready
- 2026-10-29T04:30:56Z · status ready→active, needs_input, branch
- 2026-10-29T04:33:19Z · message_queued at 2026-10-29T04:33:19.668Z
- 2026-10-29T04:58:45Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-29T04:58:45Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T04:58:46Z · message_delivered: 1 message(s)
- 2026-10-29T04:59:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T05:44:28Z · held, held-reason, held-by, held-at
