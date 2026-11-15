---
id: "1134"
title: "Engineer test runs outlive the agent turn: orphaned vitest processes burn CPU for an hour"
type: bug
status: active
priority: p1
area: core
assigned_to: ai
created_by: t@t
branch: feat/engineer-test-runs-outlive-the-agent-tur
created_at: "2026-11-15T16:22:52Z"
updated_at: "2026-11-15T17:34:06Z"
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

## Activity

- 2026-11-15T16:22:52Z · created · t@t
- 2026-11-15T16:58:01Z · status inbox→ready
- 2026-11-15T16:58:05Z · status ready→active, branch
- 2026-11-15T17:29:06Z · message_queued at 2026-11-15T17:29:06.975Z
- 2026-11-15T17:29:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:32:09Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:32:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: no assistant message · stderr: (empty)
- 2026-11-15T17:34:06Z · CTO nudge: held — an undelivered message is already queued
