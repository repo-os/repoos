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
updated_at: "2026-11-19T13:23:31Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-19T13:05:06.200Z: repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:"
handoff_signal_retry_count: 2
dev_error_count: 1
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
- 2026-11-19T12:26:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T12:27:16Z · body
- 2026-11-19T12:31:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T12:52:17Z · queued message undelivered for 26m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T12:52:17Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Report draft is at ~1200 words. Now the final scoped check on the post-merge tree: · stderr: (empty)
- 2026-11-19T12:52:17Z · message_delivered: 1 message(s)
- 2026-11-19T12:52:59Z · CTO nudge: held — handoff gate is running
- 2026-11-19T13:04:44Z · body
- 2026-11-19T13:05:03Z · message_queued at 2026-11-19T13:05:03.043Z
- 2026-11-19T13:05:06Z · message_delivered: 1 message(s)
- 2026-11-19T13:06:24Z · message_queued at 2026-11-19T13:06:24.152Z
- 2026-11-19T13:06:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:09:32Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:09:33Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The server's check found unformatted files (likely the pre-format version from the checkpoint commit). Formatter has now fixed the working tree — re-run the scoped check: · stderr: (empty)
- 2026-11-19T13:09:33Z · message_delivered: 1 message(s)
- 2026-11-19T13:10:54Z · message_queued at 2026-11-19T13:10:54.733Z
- 2026-11-19T13:10:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:11:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T13:14:02Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:14:02Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The server's check found unformatted files (likely the pre-format version from the checkpoint commit). Formatter has now fixed the working tree — re-run the scoped check: · stderr: (empty)
- 2026-11-19T13:14:03Z · message_delivered: 1 message(s)
- 2026-11-19T13:16:24Z · message_queued at 2026-11-19T13:16:24.194Z
- 2026-11-19T13:16:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:17:45Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T13:19:32Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:19:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The server's check found unformatted files (likely the pre-format version from the checkpoint commit). Formatter has now fixed the working tree — re-run the scoped check: · stderr: (empty)
- 2026-11-19T13:19:33Z · message_delivered: 1 message(s)
- 2026-11-19T13:20:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check is now running in the background. Quick status for the check-in while it runs: - **Where things stand:** the handoff failed once at the format step (`check-fmt:check`) — the server's check saw a stale, unformatted copy of … · stderr: (empty)
- 2026-11-19T13:20:54Z · orphaned run process stopped · pid 39827 · ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval · cpu 0s · age 14m
- 2026-11-19T13:21:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:21:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped `repoos check` is still running in the background (no step output yet — it prints as steps complete, and the test suite alone took ~7 minutes of the last green run). I'm letting it finish rather than stacking a second run on top… · stderr: (empty)
- 2026-11-19T13:23:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
