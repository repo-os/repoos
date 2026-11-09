---
id: "1079"
title: "Server crashed on unhandled rejection: kill() failed with EPERM (must never take the server down)"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T11:20:50Z"
updated_at: "2026-11-09T11:20:50Z"
---
## Problem
On 2026-11-09 at 18:14 local the RepoOS server died with a fatal "Unhandled promise rejection ... kill() failed: EPERM: Operation not permitted" (logged to .repoos/logs/system.log, level fatal, just after a slow `GET /api/release/available` that took 5 seconds under heavy load). Every task handoff, review, close-out and release stopped until the human restarted `repoos serve` by hand. A failed `process.kill()` on an already-gone or foreign process must never terminate the control-plane server.

## Desired UX
A failed kill is logged and handled: the server keeps running, the affected run is marked failed or cleaned up, and a bell notice says what happened. The server also restarts itself after any fatal crash (supervisor) and says so on the dashboard.

## Acceptance criteria
1. Find the call that throws the unhandled rejection (search `src/server` for `process.kill`, `child.kill` and promise-returning wrappers that reject on EPERM/ESRCH) and handle EPERM and ESRCH explicitly (treat as "already gone" or "not ours"), with a clear log line including which pid/task.
2. A global `unhandledRejection` handler must log and keep the server alive for non-fatal classes of errors (kill failures, network errors); only truly fatal errors exit. Test with an injected rejection.
3. If the server does exit fatally, the existing supervisor/launcher (or a new minimal one) restarts it and the next start posts a notice ("restarted after a crash, see logs") on the dashboard.
4. Test: simulate EPERM from kill during a hang-reaper/validation cleanup and assert the server stays up and the task state is consistent.
5. Docs: note in docs/agent-debugging-and-incidents.md with the incident summary.

## Notes for AI
Look at .repoos/logs/system.log around 2026-11-09T11:14:22Z (UTC) for the full stack and context, `src/server` reaper/watchdog code (#1049, #1060), and wherever processes are signalled. Do not edit repoos.toml.

## Activity

- 2026-11-09T11:20:50Z · created · njachowski@gmail.com
