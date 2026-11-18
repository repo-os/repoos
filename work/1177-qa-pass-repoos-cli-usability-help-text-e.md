---
id: "1177"
title: "QA pass: RepoOS CLI usability – help text, error messages and exit codes"
type: bug
status: review
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-repoos-cli-usability-help-text-e
created_at: "2026-11-18T05:56:48Z"
updated_at: "2026-11-18T08:20:56Z"
review_passes: 3
last_check_failure: "repoos check at 2026-11-18T06:45:34.810Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_rounds: 2
routing_switches: 1
routing_escalations: 1
---
## Problem
CLI commands (list, show, new, update, start, mv, done, review, handoff-status, upgrade, restart) may have unclear help or errors.
## Desired UX
Every command has accurate --help, errors say what to do next, exit codes are right.
## Acceptance criteria
- Run each command with bad input and --help in a scratch worktree/repo; fix unclear or wrong output with tests.
- Commit docs/qa/2026-11-cli-usability.md with findings.
## Notes for AI
Do not touch repoos.toml; do not run commands that mutate the real board.

## Activity

- 2026-11-18T05:56:48Z · created · t@t
- 2026-11-18T05:56:59Z · status inbox→ready
- 2026-11-18T05:57:02Z · status ready→active, branch
- 2026-11-18T06:07:52Z · body
- 2026-11-18T06:09:29Z · status active→review
- 2026-11-18T06:09:29Z · message_queued at 2026-11-18T06:09:29.575Z
- 2026-11-18T06:09:29Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T06:10:04Z · note: review pass 1: needs some work
- 2026-11-18T06:10:06Z · message_delivered: 1 message(s)
- 2026-11-18T06:10:06Z · status review→active
- 2026-11-18T06:22:56Z · body
- 2026-11-18T06:27:12Z · CTO nudge: held — handoff gate is running
- 2026-11-18T06:33:42Z · message_queued at 2026-11-18T06:33:42.633Z
- 2026-11-18T06:36:47Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T06:36:48Z · message_delivered: 1 message(s)
- 2026-11-18T06:44:13Z · body
- 2026-11-18T06:44:52Z · status active→review
- 2026-11-18T06:44:53Z · note: shots: skipped — the diff (10 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T06:45:31Z · message_queued at 2026-11-18T06:45:31.620Z
- 2026-11-18T06:45:32Z · note: review pass 2: needs some work
- 2026-11-18T06:45:33Z · message_delivered: 1 message(s)
- 2026-11-18T06:45:33Z · status review→active
- 2026-11-18T06:45:34Z · message_queued at 2026-11-18T06:45:34.688Z
- 2026-11-18T06:45:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T06:48:48Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T06:48:48Z · message_delivered: 1 message(s)
- 2026-11-18T07:28:39Z · watchdog: restarting engineer after 40m with no live process
- 2026-11-18T07:33:51Z · body
- 2026-11-18T07:34:26Z · status active→review
- 2026-11-18T07:34:28Z · note: shots: skipped — the diff (11 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T07:35:04Z · message_queued at 2026-11-18T07:35:04.352Z
- 2026-11-18T07:35:12Z · note: review pass 3: needs some work
- 2026-11-18T07:35:12Z · needs_input
- 2026-11-18T08:05:05Z · status review→active
- 2026-11-18T08:05:08Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T08:05:11Z · watchdog: restarting engineer because a queued message waited 30m with no live process
- 2026-11-18T08:05:20Z · message_queued at 2026-11-18T08:05:20.054Z
- 2026-11-18T08:05:25Z · message_delivered: 1 message(s)
- 2026-11-18T08:08:55Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T08:08:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The check has reached RepoOS remote validation and is still waiting without reporting a failure. I’m leaving it to finish, then I’ll record the checked-tree outcome in the required report draft and confirm the final diff and handoff status. · stderr: Reading additional input from stdin...
- 2026-11-18T08:08:55Z · status active→review
- 2026-11-18T08:08:56Z · message_delivered: 1 message(s)
- 2026-11-18T08:08:56Z · note: handoff requested (cli)
- 2026-11-18T08:13:22Z · CTO nudge: held — handoff gate is running
- 2026-11-18T08:15:07Z · body
- 2026-11-18T08:15:59Z · status active→review
- 2026-11-18T08:16:00Z · note: shots: skipped — the diff (13 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T08:20:55Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1177.md
- 2026-11-18T08:20:56Z · note: review pass 4: good to go
