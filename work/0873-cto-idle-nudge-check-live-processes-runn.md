---
id: "0873"
title: "CTO idle nudge: check live processes, running gates and reviews, and machine pressure first; make the threshold configurable"
type: feature
status: active
priority: p2
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cto-idle-nudge-check-live-processes-runn
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T12:23:49Z"
updated_at: "2026-10-21T01:25:24Z"
---
## Problem
The CTO's automatic idle nudge (src/server/cto-monitor.ts, `nudgeIdleActiveTasks`) fires after 5 minutes without worktree activity (AUTOMATIC_NUDGE_IDLE_MS = 5 min, cooldown 60 min, both hard-coded constants) and decides only from recent worktree file activity. On 2026-10-20 it sent "completion reminder after 5m without worktree activity" to engineers that were not idle: they were running a long `repoos check`, a remote validation wait, a handoff gate or a headless browser step, or the whole machine was thrashing (load 90-500, swap full) so nothing could write files. The reminders queue as messages and are delivered at the end of a turn, so they add noise and sometimes arrive as the engineer's next instruction, and they hid the real cause (a starved machine, a phantom runner, a running review).

## Desired UX
Before nudging, the CTO checks that the engineer is really idle: no live engineer process or child (repoos check, vitest, bun, a remote validation wait, a headless browser), no handoff gate or review running for the task, and no machine pressure that explains the silence (swap and memory pressure, see #0871 when it lands; load average only as a fallback). When one of those explains it, the CTO waits and records the reason once ("machine under pressure: Chrome 120% CPU, swap 13/15 GB") instead of nudging. The idle threshold and the cooldown are configurable (Settings control, documented). The nudge text says what the engineer should do, and a nudge is never sent when an undelivered message is already queued for that task.

## Acceptance criteria
- The nudge is skipped, with one logged reason, when: an engineer process or a known child (check, test runner, remote validation wait, headless browser) is alive for the task; a handoff gate or review is running for it; a message is already queued; or machine pressure is above a threshold.
- The idle threshold (default 5 minutes) and cooldown (default 60 minutes) are settings with Settings UI controls and docs; invalid values fall back to the defaults.
- A phantom runner (RepoOS thinks it is running, no process exists) is reported as that condition (see #0863), not nudged.
- Table-driven tests with fake process, pressure and queue inputs cover each skip reason, the default nudge, and the cooldown.
- `automation.paused = true` still halts the nudge.

## Notes for AI
Look at src/server/cto-monitor.ts (AUTOMATIC_NUDGE_IDLE_MS, AUTOMATIC_NUDGE_COOLDOWN_MS, `hasRecentWorktreeActivity`) and docs/cto-autopilot.md. Related: #0863 (phantom runners), #0869 (crash handling), #0871 (memory-pressure signal; use its probe once it lands, until then a small injectable pressure probe), #0865 (messages and reviews). Do not add the ability to kill processes; nudge, wait or escalate only.

## Shots
```json
[
{
"label": "Settings: CTO idle nudge threshold and cooldown controls",
"target": "default",
"route": "/settings?tab=general&section=automation",
"highlight": "[id=\"setting-cto.nudgeIdleMs\"]",
"steps": [
{
"waitFor": "[id=\"setting-cto.nudgeIdleMs\"]"
},
{
"waitMs": 300
}
]
}
]
```

## Activity

- 2026-10-20T12:23:49Z · created · njachowski@gmail.com
- 2026-10-21T00:05:41Z · status inbox→ready
- 2026-10-21T00:05:48Z · cli_override, model_override
- 2026-10-21T00:06:00Z · status ready→active, branch
- 2026-10-21T00:20:10Z · body
- 2026-10-21T00:21:36Z · body
- 2026-10-21T00:28:45Z · body
- 2026-10-21T00:34:30Z · body
- 2026-10-21T00:38:09Z · body
- 2026-10-21T01:02:06Z · handoff failed · remote validation failed: test failure: tests/agent-concurrency.test.ts > agent start concurrency cap > queues starts beyond maxConcurrentAgents and drains them as slots free, tests/agent-concurrency.test.ts > agent start concurrency cap > a queued task cannot be double-started while waiting for a slot, tests/agent-drivers.test.ts > qwen code driver > spawns headless args, streams output, and resumes by session id on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T01:25:24Z · message_queued at 2026-10-21T01:25:24.621Z
- 2026-10-21T01:25:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
