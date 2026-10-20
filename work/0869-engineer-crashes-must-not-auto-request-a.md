---
id: "0869"
title: Engineer crashes must not auto-request a handoff; fail over to the next allowed agent
type: bug
status: active
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/engineer-crashes-must-not-auto-request-a
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T12:06:17Z"
updated_at: "2026-10-20T19:09:33Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-20T18:37:06.042Z: repoos check failed: ◆ Check plan"
---
## Problem
On 2026-10-20 codex runs crashed intermittently ("agent exited with an error (codex) - Reading additional input from stdin", tool errors such as "write_stdin failed: Unknown process id") and the server then requested a handoff on the unfinished branch (#0843, #0860: HEAD unchanged, merge with main never done), leaving needs_input dev-error flags that stayed stale after the engineer resumed. The CTO's restart-stalled-agent action only restarts the SAME agent and model, so a crash-prone model keeps being chosen; a human or driver has to run `repoos override` and resend context. Reviews then ran on the unchanged commit and failed for reasons the engineer never saw.

## Desired UX
A crash or an unreadable final turn does not start a handoff by itself: the task stays active, the crash is logged once with its real reason, and the engineer is resumed. After N crashes or usage/auth errors in a window for the same agent+model the server switches the task to the next unpaused entry on the budget allowlist, re-sends the task context and the last undelivered messages, and records an activity note. A crash flag clears itself when the engineer makes progress again.

## Acceptance criteria
- An exited-with-error run never triggers a handoff request unless the engineer's own handoff signal was seen.
- needs_input reasons set by a crash (dev-error) are cleared on the next successful turn.
- Failover picks only unpaused allowlist pairs, never claude/cursor when paused, and honors a human-set override (a human override is never silently replaced; it is surfaced instead).
- Failover threshold and window are configurable (Settings UI control, documented).
- The new engineer receives the task context plus any undelivered messages.
- Table-driven tests: crash with and without handoff signal, repeated crashes, paused pair, human override, stale flag clearing.

## Notes for AI
Look at the watchdog, the CTO restart-stalled-agent action, the handoff request path, and needs_input handling (src/core/needs-input.ts). Relates to #0863 (phantom runners) and ADR 0008 (docs/adr/0008-centralized-agent-recovery.md, #0767): fit this into that recovery design instead of adding a third mechanism. Do not use claude or cursor in tests with live agents.

## Shots
```json
[
{
"label": "Automation settings: engineer crash failover threshold and window",
"target": "default",
"route": "/settings?tab=general&section=automation",
"highlight": "[data-config-key=\"watchdog.engineerCrashFailoverThreshold\"]"
}
]
```

## Activity

- 2026-10-20T12:06:17Z · created · njachowski@gmail.com
- 2026-10-20T12:18:15Z · story
- 2026-10-20T17:21:36Z · status inbox→ready
- 2026-10-20T17:21:39Z · cli_override, model_override
- 2026-10-20T17:21:41Z · status ready→active, branch
- 2026-10-20T17:51:02Z · body
- 2026-10-20T17:56:59Z · body
- 2026-10-20T17:58:32Z · body
- 2026-10-20T18:06:49Z · handoff failed · remote validation failed: test failure: tests/task-underspecified-flag.test.ts > underspecified flag on task start (#0613) > preserves an unrelated needs_input reason during start on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-20T18:22:48Z · body
- 2026-10-20T18:37:03Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-20T18:39:18Z · status active→ready
- 2026-10-20T18:39:30Z · status ready→active
- 2026-10-20T18:44:51Z · body
- 2026-10-20T18:47:11Z · body
- 2026-10-20T18:52:36Z · message_queued at 2026-10-20T18:52:36.190Z
- 2026-10-20T18:52:36Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T19:09:22Z · status active→ready
- 2026-10-20T19:09:27Z · body
- 2026-10-20T19:09:33Z · status ready→active
