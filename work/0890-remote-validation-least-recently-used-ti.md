---
id: "0890"
title: "Remote validation: least-recently-used tie-break across idle hosts"
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/remote-validation-least-recently-used-ti
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T02:18:32Z"
updated_at: "2026-10-21T07:51:22Z"
---
## Problem
When several remote-validation hosts are tied on active runs, the dispatcher breaks the tie by `tailscaleHosts` config order (docs/remote-validation.md, "Dispatch, health and queueing"). Most runs are short, sequential "changed" checks, so the first host is always idle at dispatch and wins every time. Observed 2026-10-19..21 in `.repoos/checks.db`: bee 466 runs, thinkpad 48, mini 4, with all three healthy and idle. Mini (macOS) and thinkpad barely get used, so the pool gives little OS coverage and no load spreading.

## Desired UX
Among eligible hosts with equal active-run counts, prefer the host that least recently finished/started a run (LRU). Config order remains the final tie-break (never-used hosts, equal timestamps). Capability/requirement filtering, health, `maxConcurrent`, `excludeHosts` and FIFO queueing behave as today. Surface the tie-break rule in the Remote runners tab / docs.

## Acceptance criteria
- With 3 idle healthy hosts and sequential single runs, runs rotate across all three rather than always the first.
- Unhealthy/degraded hosts and hosts failing job requirements are never chosen.
- Config order still decides when no host has a last-run time.
- Tests cover rotation, requirement filtering and the fallback to config order.
- docs/remote-validation.md updated (replaces the "configured host order breaks the tie" paragraph; the Remote runners tab up/down order copy adjusted).

## Notes for AI
Pool/dispatch lives around `src/core/remote-pool-queue.ts` and `src/core/remote-hosts.ts` (find `acquire`). Host `lastRun` is already tracked in the status payload.

## Activity

- 2026-10-21T02:18:32Z · created · njachowski@gmail.com
- 2026-10-21T07:44:56Z · status inbox→ready
- 2026-10-21T07:44:59Z · cli_override, model_override
- 2026-10-21T07:45:00Z · status ready→active, branch
- 2026-10-21T07:51:22Z · body
