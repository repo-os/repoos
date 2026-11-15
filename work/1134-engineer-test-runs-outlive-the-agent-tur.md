---
id: "1134"
title: "Engineer test runs outlive the agent turn: orphaned vitest processes burn CPU for an hour"
type: bug
status: done
priority: p1
area: core
merged_commit: e48820fc6b52bfd4c08ecaafeebc9b5a71ffc127
assigned_to: ai
created_by: t@t
branch: feat/engineer-test-runs-outlive-the-agent-tur
created_at: "2026-11-15T16:22:52Z"
updated_at: "2026-11-15T20:25:17Z"
last_close_out_gate_ms: 702474
last_close_out_gate_at: "2026-11-15T20:24:55.471Z"
review_passes: 1
---
## Problem
On 16 Nov 2026 at about 00:08 SGT, Nick's MacBook Air was at 6% idle CPU. Seven node processes with parent PID 1 (orphaned) were using 50 to 70% CPU each, and each had been running for 58 to 78 minutes. All of them were left behind by engineer turns that had already ended:
- #1128 worktree (feat/publish-repoos-hub-android-apk-on-github): `vitest run --config src/ui-app/vite.config.ts src/ui-app/tests/landing-clients.test.ts --maxWorkers=6`, started 22:50.
- #1130 worktree (feat/mobile-web-work-queue-renders-the-mobile): two copies of `vitest run --config src/ui-app/vite.config.ts tests/mobile-work-queue.test.ts --reporter=verbose`, started 22:54 and 22:57.
- #1131 worktree (feat/repoos-hub-mobile-hold-to-drag-server-re): three copies of `node node_modules/vitest/vitest.mjs run --config /private/var/folders/.../T/opencode/vitest-min.config.mjs --reporter=dot`, started 22:59, 23:02 and 23:05 (OpenCode engineer). Also a `node -e import("./src/ui-app/tests/helpers.ts")…sweepOrphanedRunRootProcesses()` started 23:10.
Six of the seven ignored SIGTERM and only exited on SIGKILL. Once they were killed, idle went up to about 43%.

The agent contract says RepoOS reaps a turn's process group when the turn ends. These processes escaped it: they were reparented to launchd (PID 1), most likely because they were started in their own session or process group, through `setsid`, a detached spawn, or the agent CLI's own shell tool. `sweepOrphanedRunRootProcesses` didn't catch them either, and one copy of it hung.

## Desired UX
When an engineer, reviewer or check turn ends, every process it started is gone within a few seconds, wherever it was spawned. If something escapes anyway, RepoOS finds it and stops it, and it shows up in the activity log and on the dashboard instead of quietly slowing the machine down.

## Acceptance criteria
- Turn teardown kills the whole process tree spawned under an agent turn, including grandchildren that called setsid or setpgid or were reparented. Track them by PID tree and by worktree cwd or run-root marker, not by process name. Never use `pkill`/`killall` or pattern kills. Send TERM, then KILL after a short grace period.
- A periodic sweeper (on the server tick) finds processes with ppid 1 whose cwd is inside a RepoOS-managed worktree or whose environment carries the run's marker, that belong to no live turn, and stops them by exact PID. Each kill is logged with the task id, command, CPU time and age.
- `sweepOrphanedRunRootProcesses` (src/ui-app/tests/helpers.ts) is bounded in time and can't hang.
- The pressure guard and the CTO report orphaned run processes as their own cause with PIDs, instead of only showing high load.
- A test spawns a detached grandchild (setsid plus a busy loop) from a fake agent turn, ends the turn, and asserts it's gone. Both macOS and Linux behavior are covered.

## Notes for AI
Look at the engineer turn spawner and process-group reaping in src/core (search for `process group`, `detached`, `killTree` or `reap`), the run-root markers, and `sweepOrphanedRunRootProcesses`. Agent CLIs like OpenCode, Codex and Claude Code launch tests through their own shell tools, which can create new sessions, so don't depend on the agent to clean up after itself.

## Shots
```json
[
{
"label": "Control dashboard: orphaned run processes stopped after a finished turn",
"target": "default",
"route": "/",
"highlight": "[data-orphan-runs]",
"state": "system:orphanedRuns"
}
]
```

## Activity

- 2026-11-15T16:22:52Z · created · t@t
- 2026-11-15T16:58:01Z · status inbox→ready
- 2026-11-15T16:58:05Z · status ready→active, branch
- 2026-11-15T17:29:06Z · message_queued at 2026-11-15T17:29:06.975Z
- 2026-11-15T17:29:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:32:09Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:32:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T17:34:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T17:35:09Z · message_delivered: 1 message(s)
- 2026-11-15T17:39:06Z · message_queued at 2026-11-15T17:39:06.974Z
- 2026-11-15T17:39:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:42:09Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:42:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T17:44:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T17:44:25Z · message_delivered: 1 message(s)
- 2026-11-15T17:49:07Z · message_queued at 2026-11-15T17:49:07.052Z
- 2026-11-15T17:49:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:52:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:52:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T17:53:47Z · message_delivered: 1 message(s)
- 2026-11-15T17:54:07Z · message_queued at 2026-11-15T17:54:07.131Z
- 2026-11-15T17:54:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:57:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:57:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T17:57:10Z · message_delivered: 1 message(s)
- 2026-11-15T17:58:50Z · body
- 2026-11-15T17:59:06Z · message_queued at 2026-11-15T17:59:06.978Z
- 2026-11-15T17:59:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:01:38Z · body
- 2026-11-15T18:03:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:04:10Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:04:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:05:02Z · message_delivered: 1 message(s)
- 2026-11-15T18:05:06Z · message_queued at 2026-11-15T18:05:06.558Z
- 2026-11-15T18:05:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:08:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:08:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:08:56Z · message_delivered: 1 message(s)
- 2026-11-15T18:09:07Z · message_queued at 2026-11-15T18:09:07.025Z
- 2026-11-15T18:09:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:09:27Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:12:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:12:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:12:10Z · message_delivered: 1 message(s)
- 2026-11-15T18:14:07Z · message_queued at 2026-11-15T18:14:07.008Z
- 2026-11-15T18:14:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:17:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:17:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:17:10Z · message_delivered: 1 message(s)
- 2026-11-15T18:19:07Z · message_queued at 2026-11-15T18:19:07.017Z
- 2026-11-15T18:19:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:22:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:22:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:22:10Z · message_delivered: 1 message(s)
- 2026-11-15T18:24:07Z · message_queued at 2026-11-15T18:24:07.030Z
- 2026-11-15T18:24:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:28:25Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:28:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:28:26Z · message_delivered: 1 message(s)
- 2026-11-15T18:29:07Z · message_queued at 2026-11-15T18:29:07.265Z
- 2026-11-15T18:29:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:30:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:32:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:32:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:33:40Z · message_delivered: 1 message(s)
- 2026-11-15T18:34:07Z · message_queued at 2026-11-15T18:34:07.539Z
- 2026-11-15T18:34:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:37:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:37:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:39:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:39:10Z · message_delivered: 1 message(s)
- 2026-11-15T18:39:54Z · body
- 2026-11-15T18:40:17Z · message_queued at 2026-11-15T18:40:17.016Z
- 2026-11-15T18:40:17Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:43:25Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:43:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:43:25Z · message_delivered: 1 message(s)
- 2026-11-15T18:43:44Z · message_queued at 2026-11-15T18:43:44.006Z
- 2026-11-15T18:43:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:44:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:46:55Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:46:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:46:56Z · message_delivered: 1 message(s)
- 2026-11-15T18:49:06Z · message_queued at 2026-11-15T18:49:06.995Z
- 2026-11-15T18:49:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:51:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:52:25Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:52:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:52:26Z · message_delivered: 1 message(s)
- 2026-11-15T18:54:07Z · message_queued at 2026-11-15T18:54:07.000Z
- 2026-11-15T18:54:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:57:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:57:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T18:57:11Z · message_delivered: 1 message(s)
- 2026-11-15T18:59:07Z · message_queued at 2026-11-15T18:59:07.003Z
- 2026-11-15T18:59:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T19:02:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T19:02:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T19:02:11Z · message_delivered: 1 message(s)
- 2026-11-15T19:04:07Z · message_queued at 2026-11-15T19:04:07.006Z
- 2026-11-15T19:04:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T19:07:11Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T19:07:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T19:07:12Z · message_delivered: 1 message(s)
- 2026-11-15T19:09:07Z · message_queued at 2026-11-15T19:09:07.093Z
- 2026-11-15T19:09:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T19:12:11Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T19:12:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T19:12:12Z · message_delivered: 1 message(s)
- 2026-11-15T19:14:07Z · message_queued at 2026-11-15T19:14:07.053Z
- 2026-11-15T19:14:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T19:17:11Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T19:17:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T19:17:11Z · message_delivered: 1 message(s)
- 2026-11-15T19:19:07Z · message_queued at 2026-11-15T19:19:07.029Z
- 2026-11-15T19:19:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T19:22:11Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T19:22:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T19:22:11Z · message_delivered: 1 message(s)
- 2026-11-15T19:24:07Z · message_queued at 2026-11-15T19:24:07.033Z
- 2026-11-15T19:24:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T19:24:55Z · body
- 2026-11-15T19:27:11Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T19:27:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T19:27:11Z · message_delivered: 1 message(s)
- 2026-11-15T19:29:07Z · message_queued at 2026-11-15T19:29:07.074Z
- 2026-11-15T19:29:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T19:32:30Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-15T19:32:31Z · status active→review
- 2026-11-15T19:32:31Z · message_queued at 2026-11-15T19:32:31.959Z
- 2026-11-15T19:34:41Z · note: review pass 1: good to go
- 2026-11-15T20:24:55Z · close-out gate completed in 702s
- 2026-11-15T20:25:14Z · status done→done, release:success
- 2026-11-15T20:25:17Z · message_dropped: 1 queued message(s) discarded — task is done
