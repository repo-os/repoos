---
id: "0901"
title: "Health-aware runner dispatch: skip runners under memory pressure and show it loudly with the fix"
type: feature
status: active
priority: p1
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/health-aware-runner-dispatch-skip-runner
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T14:21:05Z"
updated_at: "2026-10-21T18:28:07Z"
review_passes: 1
last_check_failure: "repoos check at 2026-10-21T17:50:23.032Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Settings: runner memory-health switch (target \"default\"): highlight #setting-remoteValidation.healthCheck matched nothing on /settings?section=remote-validation (http://127.0.0.1:64582/settings?section=remote-validation)"
---
## Problem
2026-10-21: thinkpad had 73% swap in use (3012/4095 MB); the memory-pressure guard inside the gate containers (native Linux containers see the host swap) held engineer spawns, so spawn-related tests failed remotely on that runner for #0894, #0895 (twice) and #0897, with fallbackToLocal silently re-running whole gates on the laptop. Nothing in the UI or on the tasks said a runner was unhealthy; the fix (sudo swapoff -a && sudo swapon -a, run by a human) was found by hand. Colima/Docker on macOS hosts is different: containers there see the Linux VM's memory, not macOS swap.

## Desired UX
Before leasing a runner, RepoOS reads its pressure (swap used ratio, available memory; for Colima/Docker-on-mac hosts the VM's numbers inside a probe container, not the macOS host) and skips hosts over the limit, preferring healthy ones. When a host is skipped or a gate failure matches the pressure signature, the task (activity note + drawer) and the Runners tab show a loud banner naming the host, its swap/memory numbers, and the exact human fix for that OS (Linux: sudo swapoff -a && sudo swapon -a, with the caution that it needs enough free RAM; macOS: quit memory-heavy apps or reboot), plus a command to re-check. A gate that failed only because a host was under pressure is retried on another healthy host and is never reported as a branch test failure.

## Acceptance criteria
- Runner health probe (swap ratio, available memory) per host, cached briefly, shown on the Runners tab with a healthy/pressured state and thresholds from pressureGuard settings.
- Dispatcher excludes pressured hosts from the lease pool (unless all are pressured, then it waits/queues with a visible reason rather than failing tests).
- Task activity and drawer show the skip/retry reason and the fix text; `repoos driver brief --json` lists pressured hosts.
- Tests with injected probe samples cover healthy, pressured, all-pressured, and Colima VM cases.
- A Settings control for enabling the runner-health check (per AGENTS.md rule for user-facing config).

## Notes for AI
Relates to #0900 (tests must not depend on host pressure) and #0897 (queue visibility): reuse its runner/job view. See src/core/pressure-guard.ts, resource-limits.ts, docs/remote-validation.md (pool leasing, LRU, retryOtherHosts) and the user-docs/configuration.md pressureGuard table.

## Shots
```json
[
{
"label": "Settings: runner memory-health switch",
"target": "default",
"route": "/settings?section=remote-validation",
"highlight": "[data-config-key=\"remoteValidation.healthCheck\"]",
"steps": [
{
"waitFor": "[data-config-key=\"remoteValidation.healthCheck\"]"
}
]
},
{
"label": "Runners tab: per-host memory health",
"target": "default",
"route": "/checks?tab=now",
"highlight": ".rr-panel",
"steps": [
{
"waitFor": ".rr-panel"
}
]
}
]
```

## Activity

- 2026-10-21T14:21:05Z · created · njachowski@gmail.com
- 2026-10-21T16:53:21Z · status inbox→ready
- 2026-10-21T16:53:24Z · cli_override, model_override
- 2026-10-21T16:53:26Z · status ready→active, branch
- 2026-10-21T17:14:50Z · body
- 2026-10-21T17:19:15Z · body
- 2026-10-21T17:21:11Z · body
- 2026-10-21T17:26:22Z · message_queued at 2026-10-21T17:26:22.027Z
- 2026-10-21T17:26:22Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T17:31:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T17:32:07Z · body
- 2026-10-21T17:36:37Z · body
- 2026-10-21T17:39:30Z · body
- 2026-10-21T17:41:16Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-21T17:41:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T17:41:16Z · message_delivered: 1 message(s)
- 2026-10-21T17:50:19Z · note: ui verification failed (1 issue(s)): [missing-target] Settings: runner memory-health switch (target "default"): highlight #setting-remoteValidation.healthCheck matched nothing on /settings?section=remote-validation (http://127.0.0.1:64582/settings?section=remote-validation)
- 2026-10-21T17:50:40Z · body
- 2026-10-21T17:50:48Z · body
- 2026-10-21T17:52:08Z · body
- 2026-10-21T17:53:50Z · status active→review
- 2026-10-21T17:53:50Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (872e58046) during finalization (#0734)
- 2026-10-21T17:53:51Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (872e58046) during finalization (#0734)
- 2026-10-21T17:54:52Z · note: review pass 1: good to go
- 2026-10-21T18:05:12Z · status review→active
- 2026-10-21T18:09:26Z · note: handoff requested (ui-review)
- 2026-10-21T18:28:07Z · note: ui verification passed: 2 of 2 shots captured with clean console
