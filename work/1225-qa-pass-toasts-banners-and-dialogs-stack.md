---
id: "1225"
title: "QA pass: toasts, banners and dialogs stacking and dismissal at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-toasts-banners-and-dialogs-stack
created_at: "2026-11-19T09:17:32Z"
updated_at: "2026-11-19T12:26:24Z"
handoff_signal_retry_count: 2
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-11-19T09:51:24.864Z\",\"kind\":\"dev-error\"}]"
engineer_stall_resume_log: "[{\"at\":\"2026-11-19T10:08:29.016Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
The Hub and web app have many toasts, banners and confirmation dialogs; they have not been checked together for stacking, dismissal and keyboard use at small sizes.
## Desired UX
Toasts, banners and dialogs never overlap important controls, can be dismissed by keyboard and touch, and read well at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Trigger several at once using fixtures; fix overlap, stuck banners and dead dismiss controls with tests.
- Commit docs/qa/2026-11-toasts-banners-dialogs-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Pinned five-toast stack from the new toast:stack fixture",
"target": "default",
"route": "/work",
"highlight": ".toast-panel",
"state": "toast:stack"
},
{
"label": "Notice-bell popover open: toast stack drops below it, corner returns on close",
"target": "default",
"route": "/work",
"highlight": "[data-test-id=\"notice-bell-popover\"]",
"steps": [
{
"click": "[data-test-id=\"notice-bell-trigger\"]"
},
{
"waitMs": 700
}
],
"state": "toast:stack"
}
]
```

## Activity

- 2026-11-19T09:17:32Z · created · t@t
- 2026-11-19T09:17:35Z · status inbox→ready
- 2026-11-19T09:17:36Z · status ready→active, branch
- 2026-11-19T09:17:36Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T09:51:24Z · note: stopped orphaned engineer pid 35818
- 2026-11-19T09:51:24Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T09:51:24Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-19T09:51:26Z · needs_input
- 2026-11-19T10:01:32Z · body
- 2026-11-19T10:01:59Z · body
- 2026-11-19T10:08:29Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-19T10:08:31Z · watchdog: automatic resume failed — This worktree already has a recorded live engineer for task #1225 (pid 3329)
- 2026-11-19T10:18:44Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-19T10:18:45Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1225 (pid 3329)
- 2026-11-19T10:28:59Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-19T10:29:00Z · watchdog: active-without-engineer recovery failed — This worktree already has a recorded live engineer for task #1225 (pid 3329)
- 2026-11-19T10:47:31Z · needs_input
- 2026-11-19T10:47:32Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T11:12:57Z · body
- 2026-11-19T11:14:59Z · body
- 2026-11-19T12:17:34Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T12:26:24Z · message_queued at 2026-11-19T12:26:24.150Z
