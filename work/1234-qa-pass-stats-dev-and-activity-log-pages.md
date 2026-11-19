---
id: "1234"
title: "QA pass: Stats, Dev and activity-log pages at all screen sizes"
type: bug
status: done
priority: p2
area: web
merged_commit: 5b453a21acb624d504c54aa39c95042dbedbd8bb
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-stats-dev-and-activity-log-pages
created_at: "2026-11-19T15:47:33Z"
updated_at: "2026-11-19T18:36:47Z"
last_close_out_gate_ms: 574625
last_close_out_gate_at: "2026-11-19T18:36:25.916Z"
review_passes: 1
handoff_signal_retry_count: 2
dev_error_count: 1
engineer_stall_resume_log: "[{\"at\":\"2026-11-19T15:55:13.079Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
The Stats, Dev and activity/log views show long tables, code-like output and charts that have not been QA-checked at phone, tablet and desktop widths.
## Desired UX
Tables scroll or reflow, long lines wrap or scroll inside their own box, charts stay readable, and nothing forces horizontal page scroll at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Use fixtures with long rows and output; fix overflow, clipped controls and unreadable charts with tests.
- Commit docs/qa/2026-11-stats-dev-pages-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Mission Control: system resources with PID column beside ellipsized commands",
"target": "default",
"route": "/",
"highlight": ".resource-panel"
},
{
"label": "Dev page: failed target with holder row and wrapped meta cells",
"target": "default",
"route": "/dev",
"highlight": ".dev-failure",
"state": "dev:failed"
},
{
"label": "Commit history: wrapped subjects and file paths",
"target": "default",
"route": "/repo?tab=history",
"highlight": ".hist-card"
}
]
```

## Activity

- 2026-11-19T15:47:33Z · created · t@t
- 2026-11-19T15:47:36Z · status inbox→ready
- 2026-11-19T15:47:38Z · status ready→active, branch
- 2026-11-19T15:47:38Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T15:49:36Z · note: stopped orphaned engineer pid 78499
- 2026-11-19T15:49:36Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T15:49:36Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-19T15:49:42Z · needs_input
- 2026-11-19T15:55:13Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-19T15:55:14Z · watchdog: automatic resume failed — This worktree already has a recorded live engineer for task #1234 (pid 81639)
- 2026-11-19T16:13:58Z · watchdog: restarting engineer after 19m with no live process
- 2026-11-19T16:13:59Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1234 (pid 81639)
- 2026-11-19T16:17:33Z · needs_input
- 2026-11-19T16:17:34Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T16:19:51Z · body
- 2026-11-19T16:22:56Z · body
- 2026-11-19T16:44:25Z · body
- 2026-11-19T16:47:16Z · body
- 2026-11-19T16:51:05Z · body
- 2026-11-19T16:52:10Z · body
- 2026-11-19T16:56:43Z · body
- 2026-11-19T17:26:52Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T17:30:10Z · body
- 2026-11-19T17:34:15Z · CTO nudge: held — handoff gate is running
- 2026-11-19T17:34:27Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-19T17:34:28Z · message_queued at 2026-11-19T17:34:28.706Z
- 2026-11-19T17:39:27Z · CTO nudge: held — handoff gate is running
- 2026-11-19T17:49:28Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-19T17:49:29Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-19T17:54:30Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-19T17:54:30Z · note: handoff requested (cli)
- 2026-11-19T17:59:27Z · CTO nudge: held — handoff gate is running
- 2026-11-19T18:11:50Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-19T18:11:51Z · message_queued at 2026-11-19T18:11:51.117Z
- 2026-11-19T18:11:51Z · handoff failed · task-file handoff failed at review · Engineering report must begin with ## TL;DR; remove any text before it.
- 2026-11-19T18:11:51Z · message_delivered: 1 message(s)
- 2026-11-19T18:15:03Z · body
- 2026-11-19T18:18:10Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-19T18:18:11Z · status active→review
- 2026-11-19T18:18:11Z · message_queued at 2026-11-19T18:18:11.765Z
- 2026-11-19T18:20:42Z · note: review pass 1: good to go
- 2026-11-19T18:36:25Z · close-out gate completed in 575s
- 2026-11-19T18:36:47Z · status done→done, release:success
