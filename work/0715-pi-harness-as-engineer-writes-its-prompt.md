---
updated_at: "2026-11-04T16:02:49Z"
review_passes: 2
id: "0715"
title: pi engineer ends turns cleanly without requesting handoff; stderr not surfaced; recovery is slow and the CTO cannot see why
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/pi-engineer-ends-turns-cleanly-without-r
created_at: "2026-10-06T09:14:59Z"
close_out_repair_count: 1
last_check_failure: "repoos check at 2026-11-04T10:06:31.522Z: repoos check failed: ◆ Check plan"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-04T12:30:27.556Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
Field report from tuk-private (RepoOS v0.5.66). Source rows in tuk-private/repoos/docs/repoos-feedback.md. Row 31 (3 attempts, no stderr surfaced) and row 33 (a poisoned engineer session keeps failing across harness changes until /start {"mode":"fresh"}, undocumented in the handoff).

## Problem
Two field reports plus a live reproduction on 2026-11-04.

1. tuk-private (RepoOS v0.5.66, rows 31 and 33 of its repoos-feedback.md): a `pi` engineer wrote its prompt and then did nothing across 3 attempts with no stderr surfaced; a poisoned engineer session kept failing across harness changes until `/start {"mode":"fresh"}`, which is undocumented in the handoff.
2. Live repro, task #1016 run on `pi` + `openrouter/deepseek/deepseek-v4.1-flash` (override accepted 04:23Z). The engineer edited 4 files within 2 minutes, then repeatedly exited cleanly without requesting handoff. Timeline from the task Activity: 04:32 CTO completion nudge; 04:37 next nudge held (undelivered message queued); 04:45 "engineer turn ended without a handoff: the turn exited cleanly and did not request review"; 05:38 CTO report "needs an idle-state check" and takes no action (sandbox denied process inspection, "server unavailable"); watchdog auto-resumes at 05:56 (1/3), 06:18 (2/3), 06:47 (2/3 again; the counter did not advance); handoff only requested 06:48, about 2h25m after start. `.repoos/agent-logs/1016.out.log` kept growing the whole time, so the engineer was slow or looping, not dead. The agent kept calling `repoos review 1016` itself, and never ended a turn with the `::repoos-handoff-ready::` line.
3. The CTO ran on codex and could not tell slow from stalled; recent CTO sessions also show "codex agent timed out after 300s".

## Desired UX
When a `pi` engineer ends a turn without requesting handoff, RepoOS tells the human why within one watchdog interval (last assistant text, exit reason, stderr tail), resumes the turn with an explicit handoff instruction, and does not leave the task silently idle for an hour. A poisoned session has a documented one-step recovery (`/start {"mode":"fresh"}` or `repoos start <id> --fresh`) shown in the handoff failure message.

## Acceptance criteria
- When any engineer driver's turn ends cleanly without a handoff request, the Activity line records the exit reason, the last assistant message (truncated) and the stderr tail. A `pi` run whose stderr is non-empty shows it on the task.
- The pi driver prompt and resume prompt end with an unambiguous handoff instruction (`repoos mv <id> review` or the `::repoos-handoff-ready::` line), and a test in `src/ui-app/tests/pi-driver.test.ts` asserts it.
- The watchdog resume counter advances monotonically (1/3, 2/3, 3/3) and cannot repeat a value; a test replays the #1016 sequence. After the last resume it surfaces needs-input instead of waiting.
- The CTO idle-state check uses RepoOS's own data (agent-log mtime, run state, turn-end events) rather than process inspection, and treats "clean exit without handoff and a nudge already sent" as a reason to resume the turn, not to do nothing. A test covers that case.
- The fresh-session recovery is documented in `user-docs/` and named in the handoff-failure message.
- Tests use fakes only; no real `pi` or network calls.
## Notes for AI
Start from `.repoos/agent-logs/1016.out.log` (a real pi transcript), `src/core/engineer-crash-recovery.ts`, `src/server/engineer-crash-recovery.ts`, `src/server/task-watchdog.ts`, `src/ui-app/tests/pi-driver.test.ts`, `engineer-stall-resume.test.ts` and `cto-idle-nudge.test.ts`. Do not change CTO routing or the budget allowlist. Do not assign `pi` to this task; use the default engineer.

## Activity

- 2026-10-06T09:14:59Z · created · unknown
- 2026-10-06T09:15:00Z · needs_input
- 2026-11-04T06:55:55Z · title, body: Problem (added)
- 2026-11-04T06:55:57Z · body: Desired UX (added)
- 2026-11-04T06:55:58Z · body: Acceptance criteria (added); Notes for AI (added)
- 2026-11-04T06:56:02Z · needs_input
- 2026-11-04T06:56:06Z · status inbox→ready
- 2026-11-04T06:56:09Z · status ready→active, branch
- 2026-11-04T07:17:46Z · message_queued at 2026-11-04T07:17:46.111Z
- 2026-11-04T07:17:46Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T07:22:46Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T07:45:25Z · body
- 2026-11-04T08:01:49Z · body
- 2026-11-04T08:04:26Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T08:04:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-04T08:04:27Z · message_delivered: 1 message(s)
- 2026-11-04T08:56:45Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-11-04T09:00:44Z · note: adopted orphaned engineer pid 66537
- 2026-11-04T09:10:43Z · message_queued at 2026-11-04T09:10:43.243Z
- 2026-11-04T09:10:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T09:10:59Z · body
- 2026-11-04T09:12:08Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T09:41:18Z · body
- 2026-11-04T10:00:34Z · body
- 2026-11-04T10:04:38Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T10:04:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-04T10:04:39Z · message_delivered: 1 message(s)
- 2026-11-04T10:15:10Z · message_queued at 2026-11-04T10:15:10.809Z
- 2026-11-04T10:15:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T10:20:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T10:22:03Z · body
- 2026-11-04T10:40:49Z · watchdog: check wait escalated · waiting: waiting for a local check slot (3 ahead, position 4); waiting behind #1023 check (pid 53784, alive), #1028 check (pid 80432, alive), #0715 check (pid 85674, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 5s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T10:41:19Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T11:00:51Z · body
- 2026-11-04T11:03:19Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T11:03:20Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-04T11:03:20Z · message_delivered: 1 message(s)
- 2026-11-04T11:22:36Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-11-04T11:40:01Z · message_queued at 2026-11-04T11:40:01.702Z
- 2026-11-04T11:40:02Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T11:49:28Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T12:05:35Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T12:05:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-04T12:05:36Z · message_delivered: 1 message(s)
- 2026-11-04T12:20:52Z · body
- 2026-11-04T12:30:27Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-11-04T12:44:28Z · message_queued at 2026-11-04T12:44:28.118Z
- 2026-11-04T12:44:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T12:44:52Z · engineer stopped by request
- 2026-11-04T12:48:40Z · body
- 2026-11-04T12:55:46Z · held, held-reason, held-by, held-at
- 2026-11-04T13:04:07Z · body
- 2026-11-04T13:20:46Z · body
- 2026-11-04T13:36:40Z · body
- 2026-11-04T13:48:42Z · message_overdue: still queued after 60m without being delivered
- 2026-11-04T14:37:55Z · released
- 2026-11-04T14:38:03Z · note: handoff requested (cli)
- 2026-11-04T14:54:59Z · message_queued at 2026-11-04T14:54:59.206Z
- 2026-11-04T14:54:59Z · handoff failed · task-file handoff failed at review · Engineering report narrative is 1218 words; the hard limit is 1,200 words of narrative. Shorten it and request handoff again.
- 2026-11-04T14:54:59Z · message_delivered: 2 message(s)
- 2026-11-04T14:55:12Z · message_queued at 2026-11-04T14:55:12.805Z
- 2026-11-04T14:56:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T15:04:49Z · note: handoff requested (cli)
- 2026-11-04T15:06:19Z · CTO nudge: held — handoff gate is running
- 2026-11-04T15:12:41Z · body
- 2026-11-04T15:15:34Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 9s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T15:20:02Z · status active→review
- 2026-11-04T15:20:03Z · message_queued at 2026-11-04T15:20:03.240Z
- 2026-11-04T15:20:03Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-04T15:20:04Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T15:21:47Z · note: review pass 1: good to go
- 2026-11-04T15:22:39Z · status review→active
- 2026-11-04T15:22:39Z · note: close-out repair: gate-failure
- 2026-11-04T15:22:39Z · message_delivered: 2 message(s)
- 2026-11-04T15:22:50Z · message_queued at 2026-11-04T15:22:50.471Z
- 2026-11-04T15:25:04Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 9m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T15:25:19Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T15:26:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T15:27:04Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 11m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T15:30:04Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T15:36:34Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 21m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T15:38:04Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T15:43:35Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 28m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T15:44:30Z · body
- 2026-11-04T15:45:05Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T15:46:35Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 14s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-04T15:47:50Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-04T15:49:41Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T15:49:41Z · message_queued at 2026-11-04T15:49:41.426Z
- 2026-11-04T15:49:41Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-04T15:49:45Z · message_delivered: 2 message(s)
- 2026-11-04T15:51:06Z · note: handoff requested (cli)
- 2026-11-04T15:51:19Z · CTO nudge: held — handoff gate is running
- 2026-11-04T16:01:39Z · status active→review
- 2026-11-04T16:01:40Z · message_queued at 2026-11-04T16:01:40.268Z
- 2026-11-04T16:01:40Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-04T16:02:49Z · note: review pass 2: good to go

