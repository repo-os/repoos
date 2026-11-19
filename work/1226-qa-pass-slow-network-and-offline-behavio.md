---
id: "1226"
title: "QA pass: slow network and offline behavior in the web app and Hub"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-slow-network-and-offline-behavio
created_at: "2026-11-19T09:47:34Z"
updated_at: "2026-11-19T11:17:48Z"
handoff_signal_retry_count: 2
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-11-19T09:51:25.262Z\",\"kind\":\"dev-error\"}]"
engineer_stall_resume_log: "[{\"at\":\"2026-11-19T10:00:44.011Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
The web app and Hub have not been checked for slow, failing or dropped connections.
## Desired UX
When the server is slow, unreachable or reconnecting, pages show a plain-English status, never a blank screen or endless spinner, recover on their own when the server returns, and stay usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures and request interception; never open a visible browser or steal focus.
- Check Work, task drawer, Agents and Settings under slow, 500 and offline responses; fix issues with tests.
- Commit docs/qa/2026-11-offline-slow-network-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T09:47:34Z · created · t@t
- 2026-11-19T09:47:37Z · status inbox→ready
- 2026-11-19T09:47:39Z · status ready→active, branch
- 2026-11-19T09:47:39Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T09:51:24Z · note: stopped orphaned engineer pid 94488
- 2026-11-19T09:51:25Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T09:51:25Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-19T09:51:28Z · needs_input
- 2026-11-19T10:00:44Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-19T10:00:45Z · watchdog: automatic resume failed — This worktree already has a recorded live engineer for task #1226 (pid 3767)
- 2026-11-19T10:10:59Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-19T10:11:00Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1226 (pid 3767)
- 2026-11-19T10:28:29Z · watchdog: restarting engineer after 17m with no live process
- 2026-11-19T10:28:30Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1226 (pid 3767)
- 2026-11-19T10:38:44Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-19T10:38:45Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1226 (pid 3767)
- 2026-11-19T10:47:33Z · needs_input
- 2026-11-19T10:47:34Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
