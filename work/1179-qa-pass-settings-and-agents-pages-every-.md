---
id: "1179"
title: "QA pass: Settings and Agents pages – every control saves, validates and survives reload"
type: bug
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-settings-and-agents-pages-every-
created_at: "2026-11-18T06:47:46Z"
updated_at: "2026-11-18T11:14:51Z"
review_passes: 4
review_rounds: 2
routing_switches: 1
routing_escalations: 1
handoff_signal_retry_count: 2
---
## Problem
Settings and Agents pages have many controls added over time; some may not save or validate.
## Desired UX
Each Settings tab control saves, shows validation errors clearly, and persists after reload; the Agents page shows accurate state.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree, never against the real repo config) through every Settings tab and the Agents page.
- Fix bugs found with tests; commit docs/qa/2026-11-settings-agents.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Spend threshold validation error",
"target": "default",
"route": "/settings?tab=notifications",
"highlight": "#spend-alert-error",
"steps": [
{
"fill": "#setting-attention\\.spendAlertUsd input",
"text": "-1"
},
{
"waitFor": "#spend-alert-error"
}
]
}
]
```

## Activity

- 2026-11-18T06:47:46Z · created · t@t
- 2026-11-18T06:48:02Z · status inbox→ready
- 2026-11-18T06:48:09Z · status ready→active, branch
- 2026-11-18T07:39:03Z · body
- 2026-11-18T07:43:21Z · CTO nudge: held — handoff gate is running
- 2026-11-18T07:43:45Z · status active→review
- 2026-11-18T07:43:46Z · message_queued at 2026-11-18T07:43:46.038Z
- 2026-11-18T07:43:46Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T07:44:11Z · note: review pass 1: needs some work
- 2026-11-18T07:44:12Z · message_delivered: 1 message(s)
- 2026-11-18T07:44:12Z · status review→active
- 2026-11-18T08:02:14Z · body
- 2026-11-18T08:05:02Z · body
- 2026-11-18T08:09:44Z · body
- 2026-11-18T08:13:22Z · CTO nudge: held — handoff gate is running
- 2026-11-18T08:22:04Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T08:22:05Z · status active→review
- 2026-11-18T08:22:05Z · message_queued at 2026-11-18T08:22:05.873Z
- 2026-11-18T08:22:44Z · note: review pass 2: needs some work
- 2026-11-18T08:22:44Z · message_delivered: 1 message(s)
- 2026-11-18T08:22:44Z · status review→active
- 2026-11-18T08:22:47Z · CTO nudge: held — remote validation is running
- 2026-11-18T08:23:22Z · note: Review round 2 requested a Notifications validation screenshot; resuming to add targeted capture evidence and recheck.
- 2026-11-18T08:23:52Z · body
- 2026-11-18T08:26:56Z · body
- 2026-11-18T08:28:22Z · CTO nudge: held — handoff gate is running
- 2026-11-18T08:29:50Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T08:29:50Z · message_queued at 2026-11-18T08:29:50.482Z
- 2026-11-18T08:32:56Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T08:32:57Z · message_delivered: 1 message(s)
- 2026-11-18T08:37:21Z · body
- 2026-11-18T08:38:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The missing report draft is now at [.repoos/engineering-report-drafts/1179.md](/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-settings-and-agents-pages-every-/.repoos/engineering-report-drafts/1179.md). `REPOOS_CHECK_CHANGED=main repo… · stderr: Reading additional input from stdin...
- 2026-11-18T08:38:15Z · note: handoff requested (cli)
- 2026-11-18T08:38:22Z · CTO nudge: held — handoff gate is running
- 2026-11-18T08:41:08Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T08:41:09Z · status active→review
- 2026-11-18T08:41:09Z · message_queued at 2026-11-18T08:41:09.640Z
- 2026-11-18T08:41:51Z · note: review pass 3: needs some work
- 2026-11-18T08:41:51Z · needs_input
- 2026-11-18T08:45:27Z · status review→active
- 2026-11-18T08:45:28Z · needs_input
- 2026-11-18T08:45:29Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T08:45:29Z · message_delivered: 1 message(s)
- 2026-11-18T08:46:00Z · note: Review round 3 requested a control-by-control save, validation, and reload audit; resuming work to complete it and update the QA evidence.
- 2026-11-18T08:54:52Z · note: adopted orphaned engineer pid 6507
- 2026-11-18T08:56:26Z · body
- 2026-11-18T08:57:22Z · status active→review
- 2026-11-18T09:13:08Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T09:13:09Z · message_queued at 2026-11-18T09:13:09.866Z
- 2026-11-18T09:13:10Z · note: review pass 4: needs some work
- 2026-11-18T09:13:10Z · needs_input
- 2026-11-18T09:17:33Z · status review→active
- 2026-11-18T09:17:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T09:17:36Z · needs_input
- 2026-11-18T09:17:37Z · watchdog: restarting engineer because a queued message waited 4m with no live process
- 2026-11-18T09:17:40Z · watchdog: active-without-engineer recovery failed — task is already running or finalizing
- 2026-11-18T09:17:40Z · needs_input
- 2026-11-18T09:17:41Z · message_delivered: 1 message(s)
- 2026-11-18T10:17:32Z · engineer stopped by request
- 2026-11-18T10:17:33Z · note: handoff requested (cli)
- 2026-11-18T10:32:45Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T10:32:45Z · message_queued at 2026-11-18T10:32:45.416Z
- 2026-11-18T10:32:45Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1179.md
- 2026-11-18T10:32:45Z · message_delivered: 1 message(s)
- 2026-11-18T10:59:50Z · body
- 2026-11-18T11:09:51Z · message_queued at 2026-11-18T11:09:51.193Z
- 2026-11-18T11:09:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T11:12:55Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T11:12:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The scoped check has passed its staleness/build stages and is running the changed-path test set remotely now. It has selected 577 changed plus always-run test files; I’ll let the single run finish and use its final result in the QA note. · stderr: 2026-11-18T10:33:46.248322Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 68857 2026-11-18T10:48:13.199731Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-settings-and-agents-pa…
- 2026-11-18T11:12:56Z · status active→review
- 2026-11-18T11:12:56Z · message_delivered: 1 message(s)
- 2026-11-18T11:12:56Z · note: handoff requested (cli)
- 2026-11-18T11:14:51Z · CTO nudge: held — handoff gate is running
