---
id: "1075"
title: "Tell the user when an installed upgrade is waiting for a restart, and offer Restart now"
type: feature
status: done
priority: p2
area: [web, server, cli]
merged_commit: 28facbc4a3826c9eb9b97c608b76bdbb2d164b5a
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/tell-the-user-when-an-installed-upgrade-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-09T08:24:33Z"
updated_at: "2026-11-12T17:31:15Z"
last_close_out_gate_ms: 524103
last_close_out_gate_at: "2026-11-12T17:19:40.304Z"
review_rounds: 1
review_passes: 1
last_check_failure: "repoos check at 2026-11-12T16:07:52.587Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Installed upgrade restart notice in light theme (target \"default\"): highlight [data-test-id=\"installed-restart-notice\"] matched nothing on / (http://127.0.0.1:40743/?shotState=release%3ArestartPendingLight); [missing-target] Installed upgrade restart notice in dark theme (target \"default\"): highlight [data-test-id=\"installed-restart-notice\"] matched nothing on / (http://127.0.0.1:40743/?shotState=release%3ArestartPendingD… (truncated)"
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem
`repoos upgrade` replaces the installed files, but the already-running server keeps running the old version until someone restarts it. Nothing tells the user. Concrete case (Tiao project, 2026-11-09): after `repoos upgrade` reported "Upgraded to v0.5.79", `repoos --version` printed v0.5.79 while the server (a systemd user service) was still running v0.5.78, and the dashboard kept showing the new-version reminder. The user had no way to know a restart was needed, or whether doing it would interrupt running agents, other than being told by an agent.

## Desired UX
- The dashboard detects that the installed version on disk is newer than the version the server process is running, and shows a clear notice: "RepoOS v0.5.79 is installed; this server is still running v0.5.78. Restart to use it."
- The notice has two actions: **Restart now** and **Restart when idle**, plus Dismiss (until the next version). It says how many agents or checks are running right now and warns that Restart now interrupts them (they resume afterwards, see #0214 for adopting in-flight runs).
- Restart when idle waits until no engineer, reviewer or check is running, then restarts; the notice shows it is pending and can be cancelled.
- If this server is run by a supervisor (systemd user service, launchd) the restart exits the process cleanly and lets the supervisor start it again; if it is not supervised (started by hand), the dialog says so and shows the exact command to run instead of killing the server with no way back.
- After the restart the page reconnects on its own and the notice is gone.

## Acceptance criteria
1. A running-vs-installed version check: the server records its own version at start and compares it with the installed version read from disk (cheap, cached, no network). Unit test with a fake installed version.
2. `GET /api/update-status` (or the field added to the existing release/update status from #1072; coordinate, do not create two competing endpoints) reports `restartPending`, `runningVersion`, `installedVersion`, `activeWork` (counts of running agents and checks) and `supervised`.
3. A server action and CLI parity command (for example `repoos restart [--when-idle]`) that restarts through the supervisor when supervised, refuses with a clear message and the manual command when not, and never leaves the server down. Tests with a fake supervisor detection and fake process exit. Add the route to src/cli/api-route-parity.ts per AGENTS.md.
4. UI: the notice with Restart now / Restart when idle / Dismiss, using the shared dialog components (no native dialogs, Teleport to body with data-overlay-layer where needed), a pending state, and automatic reconnect after restart. Declared shots of the notice in light and dark.
5. The CLI also prints one line after `repoos upgrade` finishes: "The running server is still v0.5.78; restart it (or run `repoos restart`) to use v0.5.79" when it can tell a server is running.
6. Docs: user-docs (upgrading) and the release-update dialog description; no new repoos.toml key unless needed (if added, add the Settings control and test per AGENTS.md).

## Notes for AI
Related tasks: #1072 (tell users a newer release exists) and #1073 (show the upgrade command in the dialog) cover the stage before the upgrade is installed; this task covers the stage after, and should reuse their update-status plumbing rather than duplicate it. #0214 is about a restart adopting in-flight agent runs; do not depend on it, but link the warning text to it. Look at how the server is launched (systemd user unit `com.repoos.serve.<project>` on Linux, launchd on macOS) in the service/installer code, and at src/commands/upgrade.ts for the version/install-kind detection.

## Shots
```json
[
{
"label": "Installed upgrade restart notice in light theme",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"installed-restart-notice\"]",
"state": "release:restartPendingLight"
},
{
"label": "Installed upgrade restart notice in dark theme",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"installed-restart-notice\"]",
"state": "release:restartPendingDark"
}
]
```

## Activity

- 2026-11-09T08:24:33Z · created · njachowski@gmail.com
- 2026-11-12T14:17:01Z · cli_override, model_override
- 2026-11-12T14:17:05Z · status inbox→ready
- 2026-11-12T14:17:36Z · status ready→active, branch
- 2026-11-12T14:21:04Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I haven’t completed task #1075, so I’m leaving it active without requesting handoff. Implemented a first pass of `GET /api/update-status`, registered it in the API parity map, and added a dashboard notice with restart controls. `bun run bu… · stderr: Reading additional input from stdin... 2026-11-12T14:21:02.508645Z ERROR codex_core::session: failed to record rollout items: thread 01a1d01f-1cb3-7ea2-8704-ded609b9dd5f not found
- 2026-11-12T14:31:36Z · body
- 2026-11-12T14:59:16Z · agent exited with an error (codex) · 2026-11-12T14:59:16.035791Z ERROR codex_core::session: failed to record rollout items: thread 01a1d01f-1cb3-7ea2-8704-ded609b9dd5f not found
- 2026-11-12T14:59:16Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-11-12T14:59:16.035791Z ERROR codex_core::session: failed to record rollout items: thread 01a1d01f-1cb3-7ea2-8704-ded609b9dd5f not found
- 2026-11-12T14:59:17Z · needs_input
- 2026-11-12T15:01:18Z · body
- 2026-11-12T15:14:48Z · message_queued at 2026-11-12T15:14:48.181Z
- 2026-11-12T15:14:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-12T15:19:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T15:23:13Z · CTO nudge: held — handoff gate is running
- 2026-11-12T15:40:59Z · handoff failed · remote validation failed: test failure: tests/pressure-guard.test.ts > waitForPressureRelief > waits until a fake probe reports relief, then proceeds on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-12T15:40:59Z · message_queued at 2026-11-12T15:40:59.524Z
- 2026-11-12T15:44:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T15:49:49Z · message_delivered: 1 message(s)
- 2026-11-12T15:49:50Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/pressure-guard.test.ts > waitForPressureRelief > waits until a fake probe reports relief, then proceeds on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-12T16:03:20Z · body
- 2026-11-12T16:04:45Z · body
- 2026-11-12T16:06:30Z · CTO nudge: held — handoff gate is running
- 2026-11-12T16:07:49Z · note: ui verification failed: ui verification failed (2 issue(s)): [missing-target] Installed upgrade restart notice in light theme (target "default"): highlight [data-test-id="installed-restart-notice"] matched nothing on / (http://127.0.0.1:40743/?shotState=release%3ArestartPendingLight); [missing-target] Installed upgrade restart notice in dark theme (target "default"): highlight [data-test-id="installed-restart-notice"] matched nothing on / (http://127.0.0.1:40743/?shotState=release%3ArestartPendi
- 2026-11-12T16:07:49Z · message_queued at 2026-11-12T16:07:49.347Z
- 2026-11-12T16:07:52Z · message_delivered: 1 message(s)
- 2026-11-12T16:19:48Z · message_queued at 2026-11-12T16:19:48.239Z
- 2026-11-12T16:19:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-12T16:24:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T16:25:08Z · body
- 2026-11-12T16:29:48Z · CTO nudge: held — handoff gate is running
- 2026-11-12T16:32:41Z · status active→review
- 2026-11-12T16:32:41Z · message_queued at 2026-11-12T16:32:41.665Z
- 2026-11-12T16:33:34Z · note: review pass 1: needs some work
- 2026-11-12T16:33:35Z · message_delivered: 1 message(s)
- 2026-11-12T16:33:35Z · status review→active
- 2026-11-12T16:33:37Z · CTO nudge: held — remote validation is running
- 2026-11-12T16:34:34Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (ee8bae1a4) during finalization (#0734)
- 2026-11-12T16:57:18Z · body
- 2026-11-12T16:59:48Z · CTO nudge: held — handoff gate is running
- 2026-11-12T17:00:07Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-12T17:00:08Z · status active→review
- 2026-11-12T17:00:08Z · message_queued at 2026-11-12T17:00:08.935Z
- 2026-11-12T17:01:33Z · note: review pass 2: good to go
- 2026-11-12T17:19:40Z · close-out gate completed in 524s
- 2026-11-12T17:19:54Z · status done→done, release:success
- 2026-11-12T17:31:15Z · message_dropped: 1 queued message(s) discarded — task is done
