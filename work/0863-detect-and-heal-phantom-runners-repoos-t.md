---
id: "0863"
title: "Detect and heal phantom runners: RepoOS thinks an engineer is running when no process exists"
type: bug
status: active
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/detect-and-heal-phantom-runners-repoos-t
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-10-20T07:42:32Z"
updated_at: "2026-10-20T16:53:15Z"
---
## Problem
Sometimes RepoOS's in-memory runner table says a task's engineer is running while no OS process exists (a "phantom runner"). Symptoms seen repeatedly on 2026-10-19/20 (#0861, #0843, #0854, #0860): `repoos start <id>` answers "Task #<id> is already running"; the task sits `active` with no commits or events for 10+ minutes; the watchdog and CTO `restart-stalled-agent` do nothing because they only act when the runner looks dead; `repoos pause` then `start --fresh` often still fails. The only reliable repair so far is `repoos mv <id> ready` then `repoos start <id>`, done by a human or driver. Each occurrence costs 10-30 minutes of idle time.

## Desired UX
The server detects a runner entry whose engineer process (and its children) no longer exists, or that has produced no output/worktree change for a configurable window while its process is gone, and clears the entry and restarts the same agent automatically, recording a visible activity-log note (e.g. "phantom runner detected: no live process, restarted"). `repoos start` on a phantom entry heals it instead of refusing. Genuinely running engineers (long gates, remote validation waiting) are never touched.

## Acceptance criteria
- A runner entry with no live process is detected within a bounded time (default a few minutes) and cleared.
- `repoos start <id>` and the UI Start action succeed on a phantom entry instead of "already running".
- Detection never fires while the engineer process or any of its child processes (check, vitest, remote validation wait) is alive.
- The heal is rate limited and logged in the task activity log and the Debug tab.
- Table-driven tests cover: live process, dead process with entry, live child only, repeated heals hitting the rate limit.
- Any new setting has a Settings UI control and is documented.

## Notes for AI
Look at the runner registry (`runner.isRunning`), the watchdog, and the CTO `restart-stalled-agent` action; ADR 0008 (docs/adr/0008-centralized-agent-recovery.md, #0767) describes the centralized recovery design this should fit into rather than adding a third mechanism. Do not kill processes by name. Do not add runtime dependencies.

## Shots
```json
[
{
"label": "Phantom runner detect window setting",
"target": "default",
"route": "/settings?setting=watchdog.phantomDetectMs",
"highlight": "[id=\"setting-watchdog.phantomDetectMs\"]"
}
]
```

## Activity

- 2026-10-20T07:42:32Z · created · njachowski@gmail.com
- 2026-10-20T11:25:49Z · status inbox→ready
- 2026-10-20T12:18:04Z · story
- 2026-10-20T13:12:43Z · cli_override, model_override
- 2026-10-20T13:13:04Z · model_override
- 2026-10-20T13:13:33Z · status ready→active, branch
- 2026-10-20T13:22:23Z · message_queued at 2026-10-20T13:22:23.718Z
- 2026-10-20T13:22:23Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T13:27:47Z · body
- 2026-10-20T13:30:31Z · body
- 2026-10-20T15:29:10Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-20T15:31:57Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:37:11Z · watchdog: auto-surfaced stuck task · status active→ready · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-10-20T16:09:55Z · status ready→active
- 2026-10-20T16:09:59Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:59Z · message_delivered: 1 message(s)
- 2026-10-20T16:17:31Z · body
- 2026-10-20T16:25:34Z · handoff failed · remote validation failed: test failure: tests/human-step-start-gate.test.ts > decision-model start gate (#0804) > refuses the start and flags the task with the explanation when the model says human, tests/human-step-start-gate.test.ts > decision-model start gate (#0804) > starts the task and suppresses the keyword flag when the model says an agent can do it, tests/human-step-start-gate.test.ts > decision-model start gate (#0804) > falls back to the keyword check when the model call fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-20T16:34:23Z · body
- 2026-10-20T16:36:29Z · body
- 2026-10-20T16:43:40Z · handoff failed · remote validation failed: test failure: tests/toml-validate.test.ts > validateToml accepts > the repository's own repoos.toml on bee — fix it in the feature branch and re-run the gate
- 2026-10-20T16:53:15Z · body
