---
id: "1234"
title: "QA pass: Stats, Dev and activity-log pages at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-stats-dev-and-activity-log-pages
created_at: "2026-11-19T15:47:33Z"
updated_at: "2026-11-19T16:19:51Z"
handoff_signal_retry_count: 2
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-11-19T15:49:36.866Z\",\"kind\":\"dev-error\"}]"
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
  "label": "Control dashboard resource panel: process table, charts and top processes at QA widths",
  "target": "default",
  "route": "/",
  "highlight": ".process-table-wrap",
  "state": "system:processTable"
},
{
  "label": "Dev page failed target with expanded log and port-holder row",
  "target": "default",
  "route": "/dev",
  "highlight": ".dev-card[data-status=\"failed\"]",
  "state": "dev:failed"
},
{
  "label": "Context history log: commit subjects and file paths wrap inside rows",
  "target": "default",
  "route": "/repo?tab=history",
  "highlight": ".hist-subject"
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
