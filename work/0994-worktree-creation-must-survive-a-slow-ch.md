---
last_close_out_gate_ms: 1110681
last_close_out_gate_at: "2026-11-01T12:52:17.126Z"
id: "0994"
title: Worktree creation must survive a slow checkout and be safe to retry
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/worktree-creation-must-survive-a-slow-ch
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-31T12:59:31Z"
updated_at: "2026-11-01T12:52:17Z"
review_passes: 2
last_check_failure: "repoos check at 2026-11-01T07:59:36.226Z: repoos check failed: tests — onKeydown: [Function: invoker] {"
handoff_signal_retry_count: 2
dev_error_count: 2
---
## Problem

Starting a task sometimes fails with "could not create worktree: ... fatal: a branch named 'feat/...' already exists", leaving an empty branch (zero commits ahead of main) and sometimes a half-checked-out directory with no worktree registration. Every later start then fails the same way until someone deletes the branch by hand. It hit #0988, #0989 and #0991 on 2026-10-31 and cost hours of idle engineer time.

## Root cause (read from `src/core/git.ts`, `ensureWorktree`)

1. The `git worktree add` runs through `gitCapture`, which is a `spawnSync` with a hard 4000 ms timeout. A checkout of about 2,800 files under machine load can take longer. The child is killed mid-checkout (the error text shows "Updating files: 42%"), after git has already created the branch.
2. The retry path in `ensureWorktree` removes the leftover target directory and re-runs the SAME `args`. When the branch did not exist at the start, those args contain `-b <branch>`, but the first attempt already created the branch, so the retry fails with "a branch named ... already exists". The retry never recomputes whether the branch exists.
3. `localBranches` also reads refs with a 4000 ms timeout and returns an empty set on timeout, which can wrongly make `branchExists` false on a later start and choose `-b` again.
4. The server's own auto-start and a manual `repoos start` can run this concurrently for the same task and collide on the branch.

## Desired UX

Starting a task either produces a registered worktree on a branch, or fails cleanly and leaves nothing behind. Starting it again just works.

## Acceptance criteria

- [ ] `git worktree add` for a task uses a timeout sized for a full checkout (and is not shared with the 4 s observational read timeout); a slow checkout completes instead of being killed.
- [ ] The retry recomputes whether the branch exists and uses the plain form (`worktree add <target> <branch>`) when the first attempt created it, never `-b` again.
- [ ] If an attempt is killed or fails, the cleanup removes the half-made directory, runs `git worktree prune`, and deletes the branch only when it has zero commits ahead of main and no worktree.
- [ ] A read timeout in `localBranches` is not treated as "branch does not exist" for this decision (ask git directly for that branch, with a longer timeout).
- [ ] Two concurrent starts for the same task do not both create the branch: one waits for or reuses the other's result.
- [ ] Tests with a fake git cover: killed-mid-checkout then retry, branch left with no worktree, a ref-read timeout, and concurrent starts.

## Notes for AI

Do not weaken the one-writer-per-worktree rule (docs/agent-run-operations.md, #0837). Do not add a runtime dependency. Never delete a branch that has commits ahead of main. See also AGENTS.md "Stuck-active incident (#0151)" for the earlier heal logic in the same function.

## Activity

- 2026-10-31T12:59:31Z · created · njachowski@gmail.com
- 2026-10-31T16:39:36Z · status inbox→ready
- 2026-10-31T16:40:05Z · cli_override, model_override
- 2026-10-31T17:32:33Z · status ready→active, branch
- 2026-10-31T18:10:24Z · note: adopted orphaned engineer pid 25301
- 2026-10-31T18:12:03Z · note: adopted orphaned engineer pid 25301
- 2026-10-31T18:49:21Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0993 check (pid 26260, alive), #0991 check (pid 98688, wedged); slot holder has made no progress for 30 minutes (no heartbeat) for 3m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T18:55:51Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T19:33:39Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0993 check (pid 17200, alive), #0994 check (pid 80846, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 15s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T19:39:10Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T20:31:51Z · status active→review
- 2026-10-31T20:31:51Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-31T20:32:45Z · note: review pass 1: good to go
- 2026-10-31T22:26:34Z · status review→active
- 2026-10-31T23:09:21Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 5s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T23:09:36Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T23:22:59Z · note: adopted orphaned engineer pid 84641
- 2026-11-01T00:51:05Z · message_queued at 2026-11-01T00:51:05.318Z
- 2026-11-01T00:56:20Z · message_queued at 2026-11-01T00:56:20.747Z
- 2026-11-01T01:01:34Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-01T01:01:35Z · note: handoff requested (cli)
- 2026-11-01T01:02:17Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0993 check (pid 57982, alive), #0995 check (pid 58198, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 9s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T01:15:47Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T01:27:29Z · note: adopted orphaned engineer pid 97089
- 2026-11-01T01:27:40Z · message_queued at 2026-11-01T01:27:40.547Z
- 2026-11-01T02:16:58Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0995 check (pid 2963, alive), #0993 check (pid 61737, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 1s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T02:28:43Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T02:31:14Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0995 check (pid 21218, alive), #0993 check (pid 61737, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 11s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T02:40:44Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T04:42:35Z · message_overdue: still queued after 60m without being delivered
- 2026-11-01T04:47:50Z · message_overdue: still queued after 60m without being delivered
- 2026-11-01T04:47:50Z · message_delivered: 3 message(s)
- 2026-11-01T06:26:37Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-01T06:26:37Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-11-01T06:53:34Z · engineer crash recovery: start failed — Could not create the task worktree: not a git repository
- 2026-11-01T07:33:28Z · needs_input
- 2026-11-01T08:09:15Z · message_queued at 2026-11-01T08:09:15.821Z
- 2026-11-01T08:09:16Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T08:14:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T08:59:45Z · engineer stopped by request
- 2026-11-01T08:59:48Z · held, held-reason, held-at
- 2026-11-01T09:01:58Z · released
- 2026-11-01T09:02:04Z · message_delivered: 1 message(s)
- 2026-11-01T09:02:26Z · message_queued at 2026-11-01T09:02:26.500Z
- 2026-11-01T09:06:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T09:44:37Z · engineer stopped by request
- 2026-11-01T09:44:37Z · held, held-reason, held-at
- 2026-11-01T09:46:21Z · released
- 2026-11-01T09:46:22Z · message_delivered: 1 message(s)
- 2026-11-01T09:46:49Z · note: adopted orphaned engineer pid 22506
- 2026-11-01T09:56:27Z · message_queued at 2026-11-01T09:56:27.680Z
- 2026-11-01T09:56:27Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T09:56:42Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T10:03:31Z · body
- 2026-11-01T10:13:05Z · engineer stopped by request
- 2026-11-01T10:13:24Z · message_delivered: 1 message(s)
- 2026-11-01T10:13:32Z · engineer stopped by request
- 2026-11-01T10:17:51Z · body
- 2026-11-01T10:19:15Z · body
- 2026-11-01T10:19:32Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 5s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T10:19:47Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T10:30:04Z · body
- 2026-11-01T10:35:03Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder has made no progress for 30 minutes (no heartbeat) for 9s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T10:35:32Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T10:35:43Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-11-01T10:36:13Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · RetriableError: Connection stalled repeatedly
- 2026-11-01T10:37:44Z · needs_input
- 2026-11-01T11:05:57Z · watchdog: restarting engineer after 28m with no live process
- 2026-11-01T11:15:41Z · message_queued at 2026-11-01T11:15:41.605Z
- 2026-11-01T11:15:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T11:20:40Z · body
- 2026-11-01T11:20:42Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T11:35:36Z · body
- 2026-11-01T11:49:11Z · body
- 2026-11-01T11:49:31Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 6s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T11:50:46Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T11:53:01Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 3s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T11:53:16Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T12:01:51Z · body
- 2026-11-01T12:02:55Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T12:02:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T12:02:56Z · message_delivered: 1 message(s)
- 2026-11-01T12:15:41Z · message_queued at 2026-11-01T12:15:41.737Z
- 2026-11-01T12:15:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T12:20:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T12:21:15Z · body
- 2026-11-01T12:23:05Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T12:23:05Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T12:23:06Z · message_delivered: 1 message(s)
- 2026-11-01T12:25:15Z · status active→review
- 2026-11-01T12:25:15Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-01T12:25:52Z · note: review pass 2: good to go
- 2026-11-01T12:52:17Z · close-out gate completed in 1111s

