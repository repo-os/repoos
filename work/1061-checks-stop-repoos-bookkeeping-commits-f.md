---
id: "1061"
title: "Checks: stop RepoOS bookkeeping commits from invalidating a running check"
type: bug
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/checks-stop-repoos-bookkeeping-commits-f
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-08T08:18:13Z"
updated_at: "2026-11-08T18:58:38Z"
review_passes: 3
last_check_failure: "repoos check at 2026-11-08T17:34:49.737Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from 476c60dd to 67f208ae) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
review_rounds: 2
handoff_signal_retry_count: 2
dev_error_count: 10
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:55:23.664Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:55:43.735Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:55:52.301Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:56:01.414Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:56:11.081Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:57:52.744Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:58:04.432Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:58:16.308Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:58:25.907Z\",\"kind\":\"usage-limit\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-08T18:58:36.510Z\",\"kind\":\"usage-limit\"}]"
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\"}"
---
## Problem
A task's check (build, tests, UI smoke, remote validation) is refused with "the worktree changed while the gate was running (HEAD moved from X to Y) — the check result no longer describes what is committed" whenever the branch tip moves while the check runs. On 2026-11-08 this repeatedly failed handoffs and forced full re-runs (each 10-60 minutes). The tip moved because of:
- RepoOS's own bookkeeping commits written automatically during the check (for example `docs(1057): record review pass 1`, `docs: record engineering report for #...`, `docs(<id>): update task`), not an agent edit;
- the automatic `WIP: engineer self-check checkpoint (#id)` commits created around each check;
- occasionally a person or a driver merging main into the worktree, or an engineer writing a report draft while the check runs.
Today none of those edits can change the result of the check (bookkeeping lives under `work/`), yet they invalidate it.

## Desired behavior
1. While a check or handoff is in flight for a task, RepoOS defers its own bookkeeping commits for that task's branch (activity records, review notes, report records, status updates) and applies them after the check ends, so the tip cannot move mid-run because of the server.
2. The "tree changed" comparison ignores changes that cannot affect the check result: paths under `work/**` (task file, `work/reports/**`) and `.repoos/**` bookkeeping. A change to any other path still invalidates the check, as today. If the changed paths cannot be determined, fail closed (treat as changed).
3. While a check runs, the task's worktree source files are protected from engineer edits (read-only or a pre-write guard) with a clear message to the agent: "A check is running; wait for it to finish." Bookkeeping paths under `work/` stay writable for RepoOS. The protection is released when the check ends (pass, fail or cancel), including after a crash (no stale locks).
4. The refusal message says exactly what moved the tip (commit subject and which paths), so a real code change is distinguishable from bookkeeping.

## Acceptance criteria
- Test: a bookkeeping-only commit (under `work/`) landing during a check does not invalidate the check.
- Test: a commit touching `src/**` during a check does invalidate it, with the changed paths named in the message.
- Test: server bookkeeping writes for a task are queued while its check runs and applied after, in order, and none is lost on crash/restart.
- Test: engineer write attempts to source files during a check are blocked with the clear message; writes to `work/` bookkeeping succeed; the lock is released after pass, fail, cancel and server restart.
- Test: fails closed when the diff of changed paths cannot be computed.
- `docs/` and `user-docs/check.md` describe the behavior; `repoos check --changed main` passes. Do NOT edit `repoos.toml`.

## Notes for AI
Start from src/server/handoff.ts (the "worktree changed while the gate was running" refusal), the WIP checkpoint commit code, and the bookkeeping writers (activity/report/status commits, `docs(<id>): ...`). Reuse the review-lock machinery if it fits. Keep the scope to these four behaviors. Related: #0598 (protect a task worktree from edits after handoff) landed earlier; read it first and extend rather than duplicate.

## Activity

- 2026-11-08T08:18:13Z · created · njachowski@gmail.com
- 2026-11-08T08:45:19Z · cli_override, model_override
- 2026-11-08T08:45:25Z · review_cli_override, review_model_override
- 2026-11-08T14:28:51Z · status inbox→ready
- 2026-11-08T15:10:02Z · status ready→active, branch
- 2026-11-08T15:27:05Z · message_queued at 2026-11-08T15:27:05.003Z
- 2026-11-08T15:27:05Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T15:29:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T15:31:49Z · body
- 2026-11-08T15:47:58Z · body
- 2026-11-08T15:54:00Z · status active→review
- 2026-11-08T15:54:00Z · message_queued at 2026-11-08T15:54:00.592Z
- 2026-11-08T15:54:00Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-08T15:56:32Z · note: review pass 1: needs some work
- 2026-11-08T15:56:32Z · status review→active
- 2026-11-08T15:56:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T16:01:41Z · message_queued at 2026-11-08T16:01:41.493Z
- 2026-11-08T16:06:56Z · message_queued at 2026-11-08T16:06:56.535Z
- 2026-11-08T16:07:48Z · message_delivered: 1 message(s)
- 2026-11-08T17:01:39Z · body
- 2026-11-08T17:01:53Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-08T17:01:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: no assistant message · stderr: (empty)
- 2026-11-08T17:01:54Z · message_delivered: 2 message(s)
- 2026-11-08T17:02:05Z · message_queued at 2026-11-08T17:02:05.066Z
- 2026-11-08T17:02:05Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T17:07:05Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T17:08:27Z · body
- 2026-11-08T17:14:07Z · note: adopted orphaned engineer pid 77995
- 2026-11-08T17:19:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T17:24:13Z · body
- 2026-11-08T17:25:52Z · status active→review
- 2026-11-08T17:25:53Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-08T17:29:16Z · note: review pass 2: needs some work
- 2026-11-08T17:29:16Z · message_queued at 2026-11-08T17:29:16.580Z
- 2026-11-08T17:29:16Z · status review→active
- 2026-11-08T17:29:18Z · CTO nudge: held — handoff gate is running
- 2026-11-08T17:34:46Z · message_queued at 2026-11-08T17:34:46.773Z
- 2026-11-08T17:35:41Z · message_delivered: 2 message(s)
- 2026-11-08T17:49:52Z · message_queued at 2026-11-08T17:49:52.519Z
- 2026-11-08T17:54:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T18:01:41Z · body
- 2026-11-08T18:13:56Z · body
- 2026-11-08T18:21:07Z · body
- 2026-11-08T18:21:49Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T18:21:49Z · message_queued at 2026-11-08T18:21:49.371Z
- 2026-11-08T18:21:49Z · ↻ resuming engineer to read queued message
- 2026-11-08T18:21:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Implementing git/write hooks, fixing WIP drift logic, and ensuring handoff check children install the gate hook without re-acquiring the lock. · stderr: (empty)
- 2026-11-08T18:25:10Z · message_delivered: 2 message(s)
- 2026-11-08T18:28:28Z · message_queued at 2026-11-08T18:28:28.950Z
- 2026-11-08T18:28:29Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T18:29:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T18:41:07Z · body
- 2026-11-08T18:41:59Z · status active→review
- 2026-11-08T18:44:04Z · note: review pass 3: needs some work
- 2026-11-08T18:44:04Z · needs_input
- 2026-11-08T18:44:37Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-08T18:44:37Z · message_queued at 2026-11-08T18:44:37.562Z
- 2026-11-08T18:50:01Z · status review→active
- 2026-11-08T18:50:01Z · note: send-back — returned to active for engineer follow-up
- 2026-11-08T18:50:04Z · needs_input
- 2026-11-08T18:50:04Z · message_queued at 2026-11-08T18:50:04.374Z
- 2026-11-08T18:50:04Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T18:53:11Z · message_delivered: 1 message(s)
- 2026-11-08T18:55:23Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:55:23Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 1/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:55:35Z · needs_input
- 2026-11-08T18:55:35Z · message_delivered: 1 message(s)
- 2026-11-08T18:55:43Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:55:43Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 2/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:55:44Z · needs_input
- 2026-11-08T18:55:52Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:55:52Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 3/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:55:53Z · needs_input
- 2026-11-08T18:56:01Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:56:01Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 4/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:56:02Z · needs_input
- 2026-11-08T18:56:11Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:56:11Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 5/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:57:44Z · needs_input
- 2026-11-08T18:57:52Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:57:52Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 6/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:57:55Z · needs_input
- 2026-11-08T18:58:04Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:58:04Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 7/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:58:06Z · needs_input
- 2026-11-08T18:58:16Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:58:16Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 8/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:58:18Z · needs_input
- 2026-11-08T18:58:25Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:58:25Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 9/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:58:28Z · needs_input
- 2026-11-08T18:58:36Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:58:36Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + opencode-go/deepseek-v4.1-flash after 10/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-08T18:58:38Z · needs_input
