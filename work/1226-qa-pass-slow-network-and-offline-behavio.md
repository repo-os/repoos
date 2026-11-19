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
updated_at: "2026-11-19T13:47:43Z"
handoff_signal_retry_count: 2
dev_error_count: 1
engineer_stall_resume_log: "[{\"at\":\"2026-11-19T10:00:44.011Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-19T12:54:47.309Z\",\"reason\":\"clean-exit-without-handoff\"}]"
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

## Shots
```json
[
{
"label": "Settings: plain-English load-error panel with Retry instead of endless skeleton",
"target": "default",
"route": "/settings",
"highlight": ".page-load-error",
"state": "settings:loadFailed"
},
{
"label": "Agents: shared load-error panel with Retry",
"target": "default",
"route": "/agents",
"highlight": ".page-load-error",
"state": "agents:loadFailed"
}
]
```

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
- 2026-11-19T11:17:49Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T11:18:33Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T11:19:05Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T11:29:41Z · body
- 2026-11-19T11:38:27Z · body
- 2026-11-19T11:41:42Z · body
- 2026-11-19T11:51:31Z · body
- 2026-11-19T12:47:39Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T12:49:45Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The report is at 1,059 words — within the target range. The scoped check is still running in the background; I'll wait for its result before handing off. **Status so far:** - The worktree already contained the full implementation from earl… · stderr: (empty)
- 2026-11-19T12:54:47Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-19T13:01:24Z · message_queued at 2026-11-19T13:01:24.325Z
- 2026-11-19T13:01:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:01:48Z · body
- 2026-11-19T13:04:32Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:04:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The report draft is complete. Now let me run the scoped check to verify everything passes. · stderr: (empty)
- 2026-11-19T13:04:32Z · message_delivered: 1 message(s)
- 2026-11-19T13:05:41Z · body
- 2026-11-19T13:06:24Z · message_queued at 2026-11-19T13:06:24.443Z
- 2026-11-19T13:06:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:09:32Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:09:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Shots declared. Now the verification gate — the scoped check: · stderr: (empty)
- 2026-11-19T13:09:34Z · message_delivered: 1 message(s)
- 2026-11-19T13:10:55Z · message_queued at 2026-11-19T13:10:55.594Z
- 2026-11-19T13:10:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:11:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T13:14:02Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:14:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Shots declared. Now the verification gate — the scoped check: · stderr: (empty)
- 2026-11-19T13:14:03Z · message_delivered: 1 message(s)
- 2026-11-19T13:16:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The check is progressing well — it's already at the remote-validation step, well past the earlier stall. I'll wait for the background run to complete (the harness will resume me with the result), then hand off if it's green. Status summary… · stderr: (empty)
- 2026-11-19T13:16:22Z · orphaned run process stopped · pid 39755 · ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval · cpu 0s · age 10m
- 2026-11-19T13:16:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:16:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The check is healthy and progressing — step 8 of 12 (rendered-contrast audit, which launches a headless browser and takes a few minutes). Steps so far all passed (theme-contrast, hardcoded-colors, etc.). No blocker — this is the normal lon… · stderr: (empty)
- 2026-11-19T13:17:45Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:17:54Z · message_queued at 2026-11-19T13:17:54.416Z
- 2026-11-19T13:17:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Still progressing — now in the test-suite pass, everything passing so far (story panels, worktree guards, refresh-evidence flows). The check is in its final long phase; I'll hand off as soon as it completes green. · stderr: (empty)
- 2026-11-19T13:17:57Z · message_delivered: 1 message(s)
- 2026-11-19T13:21:24Z · message_queued at 2026-11-19T13:21:24.386Z
- 2026-11-19T13:21:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:23:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T13:28:18Z · queued message undelivered for 7m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:28:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: No checks are targeting my worktree — the concurrent ones belong to other tasks (each with their own `dist/`). My clean audit passes on the current dist. Now running one clean, uninterrupted scoped check (foreground, long timeout): · stderr: (empty)
- 2026-11-19T13:28:18Z · message_delivered: 1 message(s)
- 2026-11-19T13:31:24Z · message_queued at 2026-11-19T13:31:24.463Z
- 2026-11-19T13:31:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:34:33Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:34:33Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: No checks are targeting my worktree — the concurrent ones belong to other tasks (each with their own `dist/`). My clean audit passes on the current dist. Now running one clean, uninterrupted scoped check (foreground, long timeout): · stderr: (empty)
- 2026-11-19T13:34:33Z · message_delivered: 1 message(s)
- 2026-11-19T13:36:24Z · message_queued at 2026-11-19T13:36:24.455Z
- 2026-11-19T13:36:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:39:22Z · body
- 2026-11-19T13:39:33Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T13:39:33Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: No checks are targeting my worktree — the concurrent ones belong to other tasks (each with their own `dist/`). My clean audit passes on the current dist. Now running one clean, uninterrupted scoped check (foreground, long timeout): · stderr: (empty)
- 2026-11-19T13:39:33Z · message_delivered: 1 message(s)
- 2026-11-19T13:40:42Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Another fresh engineer session (51 seconds old) just spawned — the server is continuously rotating engineer turns through this worktree. Given the red gate plus an active concurrent investigation, the right call is to report the blocker ra… · stderr: (empty)
- 2026-11-19T13:41:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T13:47:43Z · engineer stopped by request
