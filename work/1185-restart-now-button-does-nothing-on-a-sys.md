---
id: "1185"
title: Restart now button does nothing on a systemd-managed server (misdetected as hand-run)
type: bug
status: active
priority: p1
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/restart-now-button-does-nothing-on-a-sys
created_at: "2026-11-18T12:27:18Z"
updated_at: "2026-11-18T17:18:59Z"
close_out_repair_count: 1
review_passes: 4
last_check_failure: "repoos check at 2026-11-18T14:30:25.814Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_rounds: 2
routing_switches: 1
routing_escalations: 1
---
## Problem
On bee, the tuk-driver server runs as the systemd user unit com.repoos.serve.tuk-driver-aaa442e5.service (parent pid 1111 = systemd --user), but the 'RepoOS v0.5.90 is installed' modal said 'This server was started by hand'. Clicking Restart now made the button flicker and the modal stayed; nothing restarted (process start time unchanged, no journal entries). A manual systemctl --user restart worked.
## Desired UX
Supervisor detection recognizes a systemd user unit (and launchd) even when the process title is renamed (repoos-<project>), and Restart now actually restarts it via the supervisor. If restart fails or cannot be attempted, the modal shows a clear error instead of silently staying.
## Acceptance criteria
- Fix detection (check parent pid / INVOCATION_ID / unit cgroup, not only the process name) with tests for systemd, launchd and hand-run.
- Restart now on a supervised server calls the supervisor restart; any failure is surfaced in the modal.
- Button shows progress and the modal closes or reloads when the new server is up.
- Add a QA note to docs/qa/2026-11-releases-and-restart-qa.md that restart was checked against a real hand-run server, or say it was not.
## Notes for AI
Reported by Nick 2026-11-18 20:22 from the phone UI. Related #1154. Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Restart notice showing progress",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"installed-restart-notice\"]",
"state": "release:restartProgress"
},
{
"label": "Restart notice showing a service error",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"installed-restart-notice\"]",
"state": "release:restartError"
}
]
```

## Activity

- 2026-11-18T12:27:18Z · created · t@t
- 2026-11-18T13:17:33Z · status inbox→ready
- 2026-11-18T13:17:35Z · status ready→active, branch
- 2026-11-18T13:24:13Z · message_queued at 2026-11-18T13:24:13.169Z
- 2026-11-18T13:24:13Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T13:26:01Z · body
- 2026-11-18T13:28:15Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T13:28:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The remote build, scoped tests, contrast audit, and UI smoke passed. The local format gate found formatting issues in the two edited source files, so I’m applying the repository formatter and will rerun the scoped check as required. · stderr: Reading additional input from stdin... 2026-11-18T13:18:22.724866Z ERROR codex_core::tools::router: error=apply_patch verification failed: invalid hunk at line 35, Update hunk does not contain any lines
- 2026-11-18T13:28:15Z · message_delivered: 1 message(s)
- 2026-11-18T13:29:13Z · message_queued at 2026-11-18T13:29:13.142Z
- 2026-11-18T13:29:13Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T13:30:58Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T13:31:15Z · note: adopted orphaned engineer pid 6817
- 2026-11-18T13:36:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T13:38:01Z · body
- 2026-11-18T13:39:48Z · CTO nudge: held — handoff gate is running
- 2026-11-18T13:53:49Z · handoff failed · remote validation failed: test failure: tests/servers-command.test.ts > repoos servers --tailscale > skips unsupported mobile peers instead of reporting misleading SSH failures, tests/servers-command.test.ts > repoos servers --tailscale > falls back to configured hosts when the Tailscale CLI is unavailable, tests/servers-command.test.ts > repoos servers --tailscale > uses configured per-host users and the global Tailscale user in SSH targets on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-18T13:53:49Z · message_queued at 2026-11-18T13:53:49.495Z
- 2026-11-18T13:56:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T13:57:01Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T13:57:02Z · message_delivered: 1 message(s)
- 2026-11-18T14:04:10Z · body
- 2026-11-18T14:06:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T14:07:58Z · message_queued at 2026-11-18T14:07:58.920Z
- 2026-11-18T14:08:06Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T14:08:08Z · status active→review
- 2026-11-18T14:08:08Z · message_queued at 2026-11-18T14:08:08.783Z
- 2026-11-18T14:08:59Z · note: review pass 1: needs some work
- 2026-11-18T14:09:00Z · message_delivered: 2 message(s)
- 2026-11-18T14:09:00Z · status review→active
- 2026-11-18T14:09:03Z · CTO nudge: held — remote validation is running
- 2026-11-18T14:16:04Z · body
- 2026-11-18T14:19:24Z · CTO nudge: held — handoff gate is running
- 2026-11-18T14:19:43Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T14:19:44Z · message_queued at 2026-11-18T14:19:44.094Z
- 2026-11-18T14:21:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T14:22:47Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T14:22:49Z · message_delivered: 1 message(s)
- 2026-11-18T14:28:59Z · body
- 2026-11-18T14:29:46Z · status active→review
- 2026-11-18T14:30:22Z · note: review pass 2: needs some work
- 2026-11-18T14:30:22Z · message_queued at 2026-11-18T14:30:22.688Z
- 2026-11-18T14:30:22Z · note: shots: failed — browser capture cancelled
- 2026-11-18T14:30:22Z · message_delivered: 1 message(s)
- 2026-11-18T14:30:23Z · status review→active
- 2026-11-18T14:30:25Z · message_queued at 2026-11-18T14:30:25.691Z
- 2026-11-18T14:31:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T14:35:51Z · body
- 2026-11-18T14:36:26Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-18T14:36:26Z · message_queued at 2026-11-18T14:36:26.890Z
- 2026-11-18T14:36:27Z · ↻ resuming engineer to read queued message
- 2026-11-18T14:36:27Z · message_delivered: 2 message(s)
- 2026-11-18T14:41:14Z · message_queued at 2026-11-18T14:41:14.223Z
- 2026-11-18T14:41:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T14:41:20Z · body
- 2026-11-18T14:43:56Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T14:43:56Z · status active→review
- 2026-11-18T14:43:57Z · message_queued at 2026-11-18T14:43:57.069Z
- 2026-11-18T14:44:48Z · note: review pass 3: needs some work
- 2026-11-18T14:44:48Z · needs_input
- 2026-11-18T14:47:32Z · status review→active
- 2026-11-18T14:47:32Z · watchdog: restarting engineer because a queued message waited 4m with no live process
- 2026-11-18T14:47:34Z · message_delivered: 1 message(s)
- 2026-11-18T14:47:35Z · message_queued at 2026-11-18T14:47:35.822Z
- 2026-11-18T14:47:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T14:49:07Z · body
- 2026-11-18T14:50:39Z · body
- 2026-11-18T14:52:47Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T14:52:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The required check has started and RepoOS checkpointed the changed source for its remote validation. One task metadata wrinkle: `repoos update --shots` reports success on the canonical board, while this worktree’s task markdown remains the… · stderr: Reading additional input from stdin...
- 2026-11-18T14:52:48Z · status active→review
- 2026-11-18T14:52:48Z · message_delivered: 1 message(s)
- 2026-11-18T14:52:48Z · note: handoff requested (cli)
- 2026-11-18T14:56:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T15:01:55Z · message_queued at 2026-11-18T15:01:55.803Z
- 2026-11-18T15:01:56Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/shot-fixtures.test.ts > shot preview fixtures (#0743) > accepts the restart progress and error dialog fixtures (#1185) on mini — fix it in the feature branch and re-run the gate
- 2026-11-18T15:02:47Z · body
- 2026-11-18T15:04:28Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T15:12:03Z · note: adopted orphaned engineer pid 34241
- 2026-11-18T15:17:02Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T15:46:01Z · body
- 2026-11-18T15:48:11Z · body
- 2026-11-18T15:48:37Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-18T15:48:38Z · message_queued at 2026-11-18T15:48:38.259Z
- 2026-11-18T15:48:39Z · ↻ resuming engineer to read queued message
- 2026-11-18T15:48:40Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: no assistant message · stderr: 2026-11-18T14:52:50.543076Z ERROR codex_core::util: Custom tool call output is missing for call id: call_a7339017f48a46e38004a2d1a382c49e 2026-11-18T14:52:57.693131Z ERROR codex_core::util: Custom tool call output is missing for call id: call_a7339017f48a46e38004a2d1a382c49e 2026-11-18T14:53:04.215878Z ERROR codex_cor…
- 2026-11-18T15:48:40Z · status active→review
- 2026-11-18T15:48:41Z · message_delivered: 2 message(s)
- 2026-11-18T15:48:46Z · note: handoff requested (cli)
- 2026-11-18T15:52:02Z · CTO nudge: held — handoff gate is running
- 2026-11-18T15:52:06Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-18T15:52:07Z · status active→review
- 2026-11-18T15:52:08Z · message_queued at 2026-11-18T15:52:08.027Z
- 2026-11-18T15:53:01Z · note: review pass 4: good to go
- 2026-11-18T16:37:15Z · status review→active
- 2026-11-18T16:37:15Z · note: close-out repair: gate-failure
- 2026-11-18T16:37:15Z · message_delivered: 1 message(s)
- 2026-11-18T16:57:29Z · note: adopted orphaned engineer pid 35960
- 2026-11-18T16:57:47Z · message_queued at 2026-11-18T16:57:47.819Z
- 2026-11-18T17:00:59Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T17:01:00Z · message_delivered: 1 message(s)
- 2026-11-18T17:18:59Z · body
