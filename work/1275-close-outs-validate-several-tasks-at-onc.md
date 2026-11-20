---
id: "1275"
title: "Close-outs: validate several tasks at once on different runner machines"
type: feature
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: t@t
branch: feat/close-outs-validate-several-tasks-at-onc
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T07:42:13Z"
updated_at: "2026-11-20T09:14:34Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-20T09:04:46.665Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
handoff_signal_retry_count: 2
---
## Problem
The close-out queue runs one job at a time (queuePosition 0 validating, everything else queued) even when other runner machines (bee, mini) are idle. A full validation takes 20-25 minutes, so 11 queued tasks means about 4 hours, and one slow or failing job blocks all of them. Observed 2026-11-20: thinkpad ran #1258 for ~55 min while bee and mini had free slots and 10 green tasks waited.

## Desired UX
Validation of different queued tasks runs in parallel across available runner machines (bounded by free slots and the memory pressure guard). Publishing to main stays strictly serial under the existing lock, in queue order, and each job's candidate is rebuilt on the latest main right before publish if main moved. A failure in one job never blocks the others.

## Acceptance criteria
- Configurable max parallel validations (default small, e.g. 2) with a Settings control per the repo rule for user-facing settings.
- Validation phase can overlap across tasks; publish phase serial; a job whose base main moved re-validates only what is needed (or cheaply re-merges) before publishing, never publishing a stale candidate.
- Host choice keeps the existing fewest-active-runs rule and the pressure guard.
- Queue position and phase shown correctly in the UI and integration-job API for overlapping jobs.
- Tests for overlap, ordering, stale-base handling and failure isolation; docs/close-out-pipeline.md updated.

## Notes for AI
Read docs/close-out-pipeline.md and docs/remote-validation.md first. Never touch repoos.toml. Safety of main beats speed: if overlapping validation cannot be proven safe, fail closed and keep serial for that job.

## Activity

- 2026-11-20T07:42:13Z · created · t@t
- 2026-11-20T07:42:19Z · status inbox→ready
- 2026-11-20T07:46:48Z · cli_override, model_override
- 2026-11-20T07:46:49Z · status ready→active, branch
- 2026-11-20T08:02:31Z · message_queued at 2026-11-20T08:02:31.538Z
- 2026-11-20T08:02:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T08:02:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T08:05:34Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T08:05:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The `repoos check` run is still going on the thinkpad runner, so I'm waiting on it before reporting. The monitor will fire when the process exits, or when its 10-minute window expires. · stderr: (empty)
- 2026-11-20T08:05:35Z · message_delivered: 1 message(s)
- 2026-11-20T08:06:55Z · message_queued at 2026-11-20T08:06:55.741Z
- 2026-11-20T08:06:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T08:07:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T08:10:04Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T08:10:05Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The scoped `repoos check` is running again in the background, and the monitor will report its exit line and any failures. The earlier run was stopped when the session ended, so it gave no result. Once this run reports, I'll hand off if it … · stderr: (empty)
- 2026-11-20T08:15:22Z · message_queued at 2026-11-20T08:15:22.880Z
- 2026-11-20T08:20:38Z · message_queued at 2026-11-20T08:20:38.028Z
- 2026-11-20T08:22:21Z · message_delivered: 1 message(s)
- 2026-11-20T08:34:05Z · queued message undelivered for 19m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T08:34:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The scoped `repoos check` is still running in background task `bnf3vf86w`, and the monitor will report its outcome when the process exits. I'm not handing off yet: the check hasn't reported a result, and the task needs that before it can m… · stderr: (empty)
- 2026-11-20T08:34:07Z · message_delivered: 2 message(s)
- 2026-11-20T08:34:57Z · CTO nudge: held — handoff gate is running
- 2026-11-20T09:04:43Z · message_queued at 2026-11-20T09:04:43.435Z
- 2026-11-20T09:04:46Z · message_delivered: 1 message(s)
- 2026-11-20T09:07:31Z · message_queued at 2026-11-20T09:07:31.572Z
- 2026-11-20T09:07:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T09:10:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T09:13:26Z · queued message undelivered for 6m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T09:13:27Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The scoped `repoos check` is running again, and the monitor will report its exit line and any failures or deadline messages. I'm holding the handoff until that result is in. · stderr: (empty)
- 2026-11-20T09:13:27Z · message_delivered: 1 message(s)
- 2026-11-20T09:13:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm stopping here without emitting the handoff signal, because the check still hasn't passed. **Blocker:** `repoos check` for #1275 can't finish inside a session on this machine. The server-side finalization hit its deadline, and my two lo… · stderr: (empty)
- 2026-11-20T09:13:45Z · orphaned run process stopped · pid 66754 · /opt/homebrew/bin/bun /Users/nick/.bun/bin/repoos check · cpu 4s · age 9m
- 2026-11-20T09:14:00Z · orphaned run process stopped · pid 71013 · ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval · cpu 0s · age 8m
- 2026-11-20T09:14:23Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T09:14:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task is still blocked, so I'm not handing off. **Blocker:** the scoped `repoos check` for #1275 hits its server-side finalization deadline. The full suite takes longer than that allows. Both of my local runs were stopped when the sessi… · stderr: (empty)
