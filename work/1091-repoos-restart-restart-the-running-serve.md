---
id: "1091"
title: "repoos restart: restart the running server whether hand-run, supervised or a managed service"
type: feature
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-restart-restart-the-running-serve
cli_override: opencode
model_override: deepinfra/deepseek-ai/DeepSeek-V4.1-Flash
created_at: "2026-11-11T05:27:34Z"
updated_at: "2026-11-11T16:42:19Z"
last_handoff_failure_fingerprint: "check|repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs"
last_handoff_failure_sha: 60f9445261105da777b42d14a1ee98df2bc3c600
last_check_failure: "repoos check at 2026-11-11T12:32:54.405Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_rounds: 2
routing_switches: 1
routing_escalations: 1
review_passes: 2
dev_error_count: 13
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"deepinfra/deepseek-ai/DeepSeek-V4.1-Flash\"}"
engineer_stall_resume_log: "[{\"at\":\"2026-11-11T16:03:13.143Z\",\"reason\":\"handoff-deferred\"}]"
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"deepinfra/deepseek-ai/DeepSeek-V4.1-Flash\",\"at\":\"2026-11-11T16:41:45.627Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Restarting a RepoOS server needs a different command for each way it is running, and none of them works for a common setup. Found on the Kamrai project (mini, macOS, RepoOS v0.5.80 upgraded to v0.5.82):
- The server runs as a LaunchDaemon (`org.repoos.serve.kamrai`, `UserName=nick`, `KeepAlive=true`) from a hand-written plist.
- `repoos service` reports "No background service installed for this repo", so `repoos service restart` cannot see it.
- `repoos status` shows it as "hand-run serve".
- The documented system-level fix, `sudo launchctl kickstart -k system/org.repoos.serve.kamrai`, failed because `nick` is not a sudoer.
- What worked was `kill <pid>` as `nick`, found by hand, with launchd then restarting the process. The new server came up on the same port with the new version.

`repoos status` already warns "server is older than the installed CLI … restart" and names a restart command that does not apply here.

## Desired UX
`repoos restart` restarts this repo's server, whatever started it, and does not need sudo when the daemon runs as the invoking user. It prints which path it took and waits until `/api/health` answers, then reports the new pid and version. The `repoos status` stale-server warning names `repoos restart`.

## Acceptance criteria
1. Find the server the way `repoos stop` does (the repo's own lockfile and `~/.repoos/servers/`). It must never touch another repo's server.
2. Managed service (`repoos service install`): use the service manager's restart.
3. Hand-run server: stop it and start it again with the same flags, unless a supervisor will respawn it.
4. Externally supervised server, such as launchd with `KeepAlive`: if the pid is owned by the invoking user, stop it and let the supervisor respawn it. Wait for a new pid before reporting success. If the supervisor does not respawn within a timeout, say so and print the exact manual command instead of claiming success.
5. Refuse with a clear message if the server belongs to another user and sudo would be needed. No automatic sudo.
6. Report success only after `/api/health` returns ok and the pid has changed. Print the old and new pid and version.
7. Tests cover the three cases above plus the "supervisor never respawns" timeout and the "other user's pid" refusal. Update `user-docs/cli.md`, `user-docs/troubleshooting.md` and the `repoos status` warning text.
8. Add a CLI route/command parity entry if any API route is added.
9. Check git history for related earlier restart work (#0185 service management and #0214 server restart adoption exist).

## Notes for AI
Do not change `repoos service` semantics for managed services. Restarting a server must not kill or interrupt running engineer agents without telling the user. Server restarts are meant to adopt in-flight agents (#0214); confirm and preserve that. Never use `pkill`; stop by exact pid.

## Reporter notes
- Reproduce on macOS with a LaunchDaemon that has `KeepAlive=true`, running as a non-sudo user.
- Related quirk seen on the same box, possibly a separate task: `repoos landable` kept saying "review still lists blocking bugs" for a review whose Bugs section read "None found" followed by a bullet list of previously fixed items, but `repoos done` accepted it. The parser seems to count those bullets as bugs. Seen on Kamrai #0007 after v0.5.80; not rechecked on v0.5.82.

## Activity

- 2026-11-11T05:27:34Z · created · njachowski@gmail.com
- 2026-11-11T10:20:39Z · status inbox→ready
- 2026-11-11T10:20:42Z · status ready→active, branch
- 2026-11-11T10:30:47Z · message_queued at 2026-11-11T10:30:47.779Z
- 2026-11-11T10:30:47Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T10:35:47Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T10:54:04Z · status active→review
- 2026-11-11T10:54:04Z · message_queued at 2026-11-11T10:54:04.241Z
- 2026-11-11T10:54:04Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-11T10:55:25Z · note: review pass 1: needs some work
- 2026-11-11T10:55:26Z · message_delivered: 1 message(s)
- 2026-11-11T10:55:26Z · status review→active
- 2026-11-11T11:06:36Z · engineer stopped by request
- 2026-11-11T12:03:31Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-11T12:03:32Z · note: handoff requested (cli)
- 2026-11-11T12:08:10Z · CTO nudge: held — handoff gate is running
- 2026-11-11T12:18:09Z · message_queued at 2026-11-11T12:18:09.412Z
- 2026-11-11T12:18:09Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1091.md
- 2026-11-11T12:18:09Z · message_delivered: 1 message(s)
- 2026-11-11T12:28:10Z · message_queued at 2026-11-11T12:28:10.357Z
- 2026-11-11T12:28:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T12:28:23Z · body
- 2026-11-11T12:30:29Z · status active→review
- 2026-11-11T12:30:32Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-11T12:32:51Z · message_queued at 2026-11-11T12:32:51.185Z
- 2026-11-11T12:32:51Z · note: review pass 2: needs some work
- 2026-11-11T12:32:53Z · message_delivered: 1 message(s)
- 2026-11-11T12:32:53Z · status review→active
- 2026-11-11T12:32:54Z · message_queued at 2026-11-11T12:32:54.190Z
- 2026-11-11T12:32:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T12:46:21Z · body
- 2026-11-11T13:01:52Z · body
- 2026-11-11T13:13:10Z · CTO nudge: held — handoff gate is running
- 2026-11-11T13:22:30Z · body
- 2026-11-11T13:28:46Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-11T13:28:46Z · message_queued at 2026-11-11T13:28:46.757Z
- 2026-11-11T13:28:47Z · ↻ resuming engineer to read queued message
- 2026-11-11T13:28:48Z · message_delivered: 2 message(s)
- 2026-11-11T13:33:10Z · message_queued at 2026-11-11T13:33:10.744Z
- 2026-11-11T13:33:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T13:38:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T13:40:48Z · body
- 2026-11-11T13:48:11Z · CTO nudge: held — handoff gate is running
- 2026-11-11T13:48:32Z · message_queued at 2026-11-11T13:48:32.232Z
- 2026-11-11T13:53:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T13:58:15Z · message_delivered: 1 message(s)
- 2026-11-11T13:58:16Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1091.md
- 2026-11-11T14:00:53Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:01:23Z · engineer crash recovery: resuming cursor + composer-2.5 (1/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:01:26Z · needs_input
- 2026-11-11T14:01:43Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:02:43Z · engineer crash recovery: resuming cursor + composer-2.5 (2/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:02:47Z · needs_input
- 2026-11-11T14:03:03Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:04:33Z · engineer crash recovery: resuming cursor + composer-2.5 (3/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:04:38Z · needs_input
- 2026-11-11T14:04:56Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:06:56Z · engineer crash recovery: resuming cursor + composer-2.5 (4/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:07:00Z · needs_input
- 2026-11-11T14:08:33Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:11:03Z · engineer crash recovery: resuming cursor + composer-2.5 (5/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:11:07Z · needs_input
- 2026-11-11T14:13:55Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:16:55Z · engineer crash recovery: resuming cursor + composer-2.5 (6/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:17:00Z · needs_input
- 2026-11-11T14:17:45Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:21:15Z · engineer crash recovery: resuming cursor + composer-2.5 (7/12 crashes in 30m) · Error: [unavailable] read ETIMEDOUT
- 2026-11-11T14:21:21Z · needs_input
- 2026-11-11T14:28:32Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-11-11T14:32:32Z · engineer crash recovery: resuming cursor + composer-2.5 (8/12 crashes in 30m) · RetriableError: Connection stalled repeatedly
- 2026-11-11T14:32:37Z · needs_input
- 2026-11-11T14:33:57Z · agent exited with an error (cursor) · Error: [unavailable]
- 2026-11-11T14:33:57Z · engineer crash recovery: switched cursor + composer-2.5 → opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash after 6/3 crashes in 30m · Error: [unavailable]
- 2026-11-11T14:34:02Z · needs_input
- 2026-11-11T14:39:10Z · agent exited with an error (opencode) · Error: [unavailable]
- 2026-11-11T14:39:10Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (1/3 crashes in 30m) · Error: [unavailable]
- 2026-11-11T14:39:13Z · needs_input
- 2026-11-11T14:40:39Z · agent exited with an error (opencode) · Error: [unavailable]
- 2026-11-11T14:40:39Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (2/3 crashes in 30m) · Error: [unavailable]
- 2026-11-11T14:40:44Z · needs_input
- 2026-11-11T14:42:11Z · agent exited with an error (opencode) · Error: [unavailable]
- 2026-11-11T14:42:11Z · engineer crash recovery: surfaced instead of switching — RepoOS already switched this task once (opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash); it will not chain another automatic switch (3/3 crashes in 30m)
- 2026-11-11T14:52:19Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-11T15:08:12Z · message_queued at 2026-11-11T15:08:11.997Z
- 2026-11-11T15:08:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-11T15:13:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T15:13:13Z · body
- 2026-11-11T15:27:33Z · body
- 2026-11-11T15:33:12Z · CTO nudge: held — handoff gate is running
- 2026-11-11T15:34:52Z · message_queued at 2026-11-11T15:34:52.928Z
- 2026-11-11T15:38:07Z · message_delivered: 1 message(s)
- 2026-11-11T15:58:07Z · message_queued at 2026-11-11T15:58:07.720Z
- 2026-11-11T15:58:13Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T16:03:13Z · watchdog: auto-resumed engineer to read a deferred handoff message · resume 1/3
- 2026-11-11T16:08:17Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1091.md · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-11T16:08:18Z · note: handoff requested (cli)
- 2026-11-11T16:13:14Z · CTO nudge: held — handoff gate is running
- 2026-11-11T16:13:33Z · message_queued at 2026-11-11T16:13:33.191Z
- 2026-11-11T16:13:33Z · handoff failed · task-file handoff failed at check · repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs
- 2026-11-11T16:18:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-11T16:29:47Z · message_delivered: 1 message(s)
- 2026-11-11T16:41:45Z · agent exited with an error (opencode) · error: Transport
- 2026-11-11T16:41:45Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (1/3 crashes in 30m) · error: Transport
- 2026-11-11T16:42:18Z · needs_input
- 2026-11-11T16:42:19Z · message_delivered: 1 message(s)
