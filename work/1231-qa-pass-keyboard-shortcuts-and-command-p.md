---
id: "1231"
title: "QA pass: keyboard shortcuts and command palette across pages"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-keyboard-shortcuts-and-command-p
created_at: "2026-11-19T13:47:53Z"
updated_at: "2026-11-19T15:56:14Z"
last_check_failure: "repoos check at 2026-11-19T15:37:14.041Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Command palette open over the work board (stacks above drawers, consumes Esc) (target \"default\"): loading state detected: loading indicator [aria-busy=\"true\"] on /work (http://127.0.0.1:43037/work)"
review_rounds: 1
routing_switches: 1
review_passes: 1
handoff_signal_retry_count: 2
dev_error_count: 3
engineer_stall_resume_log: "[{\"at\":\"2026-11-19T14:18:11.944Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-19T15:02:12.103Z\",\"reason\":\"clean-exit-without-handoff\"}]"
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/glm-5.3-flash\",\"at\":\"2026-11-19T15:49:38.888Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Keyboard shortcuts and any command palette or search shortcut have not been checked for conflicts, discoverability or touch/small-screen behavior.
## Desired UX
Shortcuts work on every main page without clashing with text fields, are listed somewhere findable, and nothing breaks at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Inventory the shortcuts, test them with focus in inputs, dialogs and drawers; fix conflicts and dead shortcuts with tests.
- Commit docs/qa/2026-11-keyboard-shortcuts-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Command palette open over the dashboard",
"target": "default",
"route": "/",
"highlight": ".search-overlay",
"steps": [
{
"click": ".search-input"
},
{
"waitMs": 300
}
]
},
{
"label": "Command palette open above the Work board",
"target": "default",
"route": "/work",
"highlight": ".search-overlay",
"steps": [
{
"waitFor": ".task-card"
},
{
"click": ".search-input"
},
{
"waitMs": 300
}
],
"state": "board:withReviewTask"
}
]
```

## Activity

- 2026-11-19T13:47:53Z · created · t@t
- 2026-11-19T13:47:56Z · status inbox→ready
- 2026-11-19T13:47:58Z · status ready→active, branch
- 2026-11-19T13:47:58Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T14:04:52Z · note: stopped orphaned engineer pid 91332
- 2026-11-19T14:04:52Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-19T14:04:52Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output. Open Raw CLI error for details. (CLI: the agent process exited with an error — open the task to see the full output)
- 2026-11-19T14:04:57Z · needs_input
- 2026-11-19T14:08:42Z · orphaned run process stopped · pid 22268 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun --experimental-import-meta-resolve --require /Users/nick/code · cpu 3s · age 20s
- 2026-11-19T14:10:34Z · body
- 2026-11-19T14:18:11Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-19T14:18:13Z · watchdog: automatic resume failed — This worktree already has a recorded live engineer for task #1231 (pid 12272)
- 2026-11-19T14:25:48Z · body
- 2026-11-19T14:27:16Z · body
- 2026-11-19T14:37:27Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-19T14:41:35Z · body
- 2026-11-19T14:44:06Z · CTO nudge: held — handoff gate is running
- 2026-11-19T14:44:47Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T14:44:48Z · message_queued at 2026-11-19T14:44:48.309Z
- 2026-11-19T14:44:51Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T14:47:57Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T14:47:59Z · message_delivered: 1 message(s)
- 2026-11-19T14:51:23Z · body
- 2026-11-19T14:51:58Z · note: stopped orphaned engineer pid 35882
- 2026-11-19T14:51:59Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: ✗ Server finalization stopped at review: Engineering report must begin with ## TL;DR; remove any text before it.. The same worktree can be resumed and retried.)
- 2026-11-19T14:51:59Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: ✗ Server finalization stopped at review: Engineering report must begin with ## TL;DR; remove any text before it.. The same worktree can be resumed and retried.)
- 2026-11-19T14:52:03Z · needs_input
- 2026-11-19T14:56:36Z · body
- 2026-11-19T15:02:12Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-19T15:07:33Z · body
- 2026-11-19T15:11:26Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T15:11:27Z · status active→review
- 2026-11-19T15:11:28Z · message_queued at 2026-11-19T15:11:28.037Z
- 2026-11-19T15:14:57Z · note: review pass 1: needs some work
- 2026-11-19T15:14:58Z · message_delivered: 1 message(s)
- 2026-11-19T15:14:58Z · status review→active
- 2026-11-19T15:26:27Z · body
- 2026-11-19T15:29:32Z · body
- 2026-11-19T15:32:30Z · body
- 2026-11-19T15:36:56Z · CTO nudge: held — handoff gate is running
- 2026-11-19T15:37:10Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Command palette open over the work board (stacks above drawers, consumes Esc) (target "default"): loading state detected: loading indicator [aria-busy="true"] on /work (http://127.0.0.1:43037/work)
- 2026-11-19T15:37:10Z · message_queued at 2026-11-19T15:37:10.923Z
- 2026-11-19T15:37:13Z · message_delivered: 1 message(s)
- 2026-11-19T15:37:35Z · body
- 2026-11-19T15:41:24Z · body
- 2026-11-19T15:45:09Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-19T15:45:10Z · message_queued at 2026-11-19T15:45:10.672Z
- 2026-11-19T15:46:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T15:48:12Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T15:48:14Z · message_delivered: 1 message(s)
- 2026-11-19T15:49:36Z · note: stopped orphaned engineer pid 78856
- 2026-11-19T15:49:36Z · note: stopped orphaned engineer pid 78856
- 2026-11-19T15:49:38Z · agent exited with an error (opencode) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: ✗ Server finalization stopped at review: Engineering report must begin with ## TL;DR; remove any text before it.. The same worktree can be resumed and retried.)
- 2026-11-19T15:49:38Z · engineer crash recovery: resuming opencode + opencode-go/glm-5.3-flash (1/3 crashes in 30m) · OpenCode exited with an error. Open Raw CLI error for details. (CLI: ✗ Server finalization stopped at review: Engineering report must begin with ## TL;DR; remove any text before it.. The same worktree can be resumed and retried.)
- 2026-11-19T15:49:38Z · note: handoff requested (cli)
- 2026-11-19T15:49:43Z · needs_input
- 2026-11-19T15:54:28Z · body
- 2026-11-19T15:54:35Z · CTO nudge: held — handoff gate is running
- 2026-11-19T15:56:14Z · body
