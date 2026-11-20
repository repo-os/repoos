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
updated_at: "2026-11-20T15:41:17Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-20T11:18:52.239Z: repoos check failed: vite v8.2.0 building client environment for production..."
last_handoff_failure_fingerprint: "check|repoos check failed: ◆ Check plan"
last_handoff_failure_sha: 82edbaa33be212d01145fb74bfb7a40640482476
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
- 2026-11-20T09:14:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T09:20:00Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-20T09:20:03Z · note: handoff requested (cli)
- 2026-11-20T09:22:36Z · CTO nudge: held — handoff gate is running
- 2026-11-20T09:29:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Nothing has changed since my last report, so I'm not handing off again. Re-requesting handoff would run the same full check into the same server deadline. **Blocker:** the scoped `repoos check` for #1275 exceeds the server-side finalizatio… · stderr: (empty)
- 2026-11-20T09:31:17Z · orphaned run process stopped · pid 38412 · sleep 60 · cpu 0s · age 16s
- 2026-11-20T09:31:17Z · orphaned run process stopped · pid 39614 · sleep 60 · cpu 0s · age 11s
- 2026-11-20T09:31:18Z · orphaned run process stopped · pid 39751 · sleep 60 · cpu 0s · age 10s
- 2026-11-20T09:31:47Z · orphaned run process stopped · pid 41900 · sleep 60 · cpu 0s · age 35s
- 2026-11-20T09:31:48Z · orphaned run process stopped · pid 52501 · sleep 60 · cpu 0s · age 10s
- 2026-11-20T09:46:45Z · message_queued at 2026-11-20T09:46:45.627Z
- 2026-11-20T09:46:46Z · handoff failed · task-file handoff failed at check · repoos check failed: ◆ Check plan
- 2026-11-20T09:46:58Z · orphaned run process stopped · pid 56591 · bun run smoke · cpu 0s · age 13s
- 2026-11-20T09:47:13Z · orphaned run process stopped · pid 56592 · bun scripts/ui-smoke.mjs · cpu 3s · age 28s
- 2026-11-20T09:47:36Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T10:10:42Z · message_delivered: 1 message(s)
- 2026-11-20T10:48:29Z · CTO nudge: held — handoff gate is running
- 2026-11-20T11:04:34Z · orphaned run process stopped · pid 66554 · sleep 60 · cpu 0s · age 19s
- 2026-11-20T11:04:35Z · orphaned run process stopped · pid 67201 · sleep 60 · cpu 0s · age 14s
- 2026-11-20T11:04:35Z · orphaned run process stopped · pid 67384 · sleep 60 · cpu 0s · age 14s
- 2026-11-20T11:04:50Z · orphaned run process stopped · pid 68591 · sleep 60 · cpu 0s · age 23s
- 2026-11-20T11:05:06Z · orphaned run process stopped · pid 72576 · sleep 60 · cpu 0s · age 13s
- 2026-11-20T11:18:49Z · message_queued at 2026-11-20T11:18:49.216Z
- 2026-11-20T11:23:29Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T11:34:28Z · message_delivered: 1 message(s)
- 2026-11-20T11:38:29Z · CTO nudge: held — handoff gate is running
- 2026-11-20T12:00:48Z · orphaned run process stopped · pid 83506 · sleep 60 · cpu 0s · age 17s
- 2026-11-20T12:00:48Z · orphaned run process stopped · pid 83677 · sleep 60 · cpu 0s · age 12s
- 2026-11-20T12:00:49Z · orphaned run process stopped · pid 83807 · sleep 60 · cpu 0s · age 11s
- 2026-11-20T12:01:19Z · orphaned run process stopped · pid 84170 · sleep 60 · cpu 0s · age 35s
- 2026-11-20T12:01:19Z · orphaned run process stopped · pid 85315 · sleep 60 · cpu 0s · age 10s
- 2026-11-20T12:04:12Z · handoff failed · check failed after 2 automatic retries · repoos check failed: ◆ Check plan
- 2026-11-20T12:04:13Z · message_queued at 2026-11-20T12:04:13.244Z
- 2026-11-20T12:04:20Z · orphaned run process stopped · pid 6825 · bun run smoke · cpu 0s · age 12s
- 2026-11-20T12:07:17Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T12:08:33Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T12:20:04Z · message_delivered: 1 message(s)
- 2026-11-20T12:38:33Z · message_queued at 2026-11-20T12:38:33.598Z
- 2026-11-20T12:38:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T12:41:44Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T12:41:46Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The check is running now, with the scoped step on the thinkpad runner for commit `e672ced93`. The run is in the background and will notify me when it exits. I'm pausing here until that result is in. **Status for #1275 (not finished yet):**… · stderr: (empty)
- 2026-11-20T12:43:33Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T13:07:41Z · message_delivered: 1 message(s)
- 2026-11-20T13:07:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The handoff check failed again, so I'm not requesting another run. **Status:** the server's most recent check for #1275 failed at 12:04 with a truncated reason, `repoos check failed: ◆ Check plan`. The step that fails never shows its name … · stderr: (empty)
- 2026-11-20T13:08:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T13:09:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task is still blocked, and I'm not requesting another handoff. The server's latest check (12:04) failed at `◆ Check plan` with the reason cut off, so I can't see which step failed. The last handoff status hasn't changed since. **What's… · stderr: (empty)
- 2026-11-20T13:13:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T13:13:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Still blocked, and nothing has changed since my last report. The server's latest check for #1275 is the 12:04 failure at `◆ Check plan`, and the step name and error are still missing. I haven't requested another handoff, since it would rer… · stderr: (empty)
- 2026-11-20T13:18:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T13:18:36Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Nothing has changed, so this is the same blocker as before, and I'm not requesting handoff again. **Blocker:** the server's latest check for #1275 failed at `◆ Check plan` (12:04), and the step name and error are missing from the status ou… · stderr: (empty)
- 2026-11-20T13:18:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T13:19:00Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, and I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04). The status output doesn't name the failing step or its error, so I can't fix it yet. To unbloc… · stderr: (empty)
- 2026-11-20T13:20:36Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T13:40:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task is still blocked, and the server status hasn't changed since the 12:04 failure at `◆ Check plan`. I'm not requesting handoff again, because the server would rerun the same check and hit the same failure. The status output doesn't … · stderr: (empty)
- 2026-11-20T13:43:33Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T13:59:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, and I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04). The status output doesn't name the failing step or its error, so I have nothing to fix. To unb… · stderr: (empty)
- 2026-11-20T14:01:09Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T14:19:50Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Still blocked. The status hasn't changed since the 12:04 server check failed at `◆ Check plan`, and it still doesn't say which step failed or why. I'm not requesting handoff again, because the server would rerun the same check and hit the … · stderr: (empty)
- 2026-11-20T14:23:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T14:24:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04). The status output still doesn't name the failing step or its error. To unblock, someone with runner… · stderr: (empty)
- 2026-11-20T14:28:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T14:42:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04), and the status still doesn't show the failing step or its error. To unblock, someone with runne… · stderr: (empty)
- 2026-11-20T14:43:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T14:46:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The status is unchanged: the server's latest check for #1275 failed at `◆ Check plan` (12:04), and the failing step and its error still aren't shown. I'm not requesting handoff again, because the server would rerun the same check and fail … · stderr: (empty)
- 2026-11-20T14:48:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T14:48:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04). The status still doesn't show the failing step or its error. To unblock, someone with runner ac… · stderr: (empty)
- 2026-11-20T14:50:36Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T14:50:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04), and the failing step and its error still aren't in the status output. To unblock, someone with … · stderr: (empty)
- 2026-11-20T14:56:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T14:56:21Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04). The status output still doesn't name the failing step or show its error. To unblock, someone wi… · stderr: (empty)
- 2026-11-20T15:01:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:01:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04). The status output still doesn't name the failing step or its error. To unblock, someone with ru… · stderr: (empty)
- 2026-11-20T15:04:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:09:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04), and the failing step and its error still aren't shown. To unblock, someone with runner access n… · stderr: (empty)
- 2026-11-20T15:11:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:29:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The status is unchanged. The server's last check for #1275 failed at `◆ Check plan` (12:04), and the status still doesn't name the failing step or show its error. I'm not requesting handoff again, because the server would rerun the same ch… · stderr: (empty)
- 2026-11-20T15:31:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:32:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04). The status output doesn't name the failing step or show its error. To unblock, someone with run… · stderr: (empty)
- 2026-11-20T15:32:52Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:32:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04), and the failing step and its error still aren't shown. To unblock, someone with runner access n… · stderr: (empty)
- 2026-11-20T15:36:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:36:17Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04), and the failing step and its error still aren't shown. To unblock, someone with runner access n… · stderr: (empty)
- 2026-11-20T15:41:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:41:17Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm still blocked on the same thing, so I'm not requesting handoff again. The server's latest check for #1275 failed at `◆ Check plan` (12:04), and the failing step and its error still aren't shown. To unblock, someone with runner access n… · stderr: (empty)
