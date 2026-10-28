---
id: "0959"
title: "Server-down UI: distinguish refused from busy, show the project's restart command, and watch per-project servers"
type: feature
status: ready
priority: p1
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-25T12:30:39Z"
updated_at: "2026-10-28T16:39:40Z"
---
## Problem

When a project's RepoOS server is not running, the UI shows "Server connection issue … Restart it (`repoos serve`), then reload." It says nothing about which server or port, and the same banner shows for a stalled-but-running server. Retry/reload only waits on the page's own origin, so it cannot succeed when the server is down, and the user has no way to tell the two cases apart.

Real case (2026-10-25): the Divot project's server on `127.0.0.1:7405` had been stopped with SIGTERM and was not running. The banner looked like the RepoOS repo's, Retry did nothing, and the cause took a round trip to find. `com.repoos.watchdog` (`~/.local/bin/repoos-watchdog.sh`) only probes and kickstarts `com.repoos.serve` on port 7171, so per-project servers such as Divot's (`com.repoos.serve.divot-4a26b39f`, port 7405) are not covered by it.

## Desired UX

- Distinguish the two states. A refused connection says the server is not running. A timeout says it is running but not answering in time. Each gets its own wording, and Retry reports what it actually checked.
- Name the project and origin in the banner (for example "Divot server at 127.0.0.1:7405 is not running"), plus when the UI last reached it.
- When the server is down, show a copyable restart command for that project (the launchd job's `launchctl kickstart` line, or `repoos serve --port <port>` when no job exists).
- The RepoOS Hub (native app) is where a Restart button belongs: it already knows each project's port and job. The browser cannot start a process, so this is not a browser feature.
- Automatic restart is out of scope for this task. If wanted later, it must honor an intentional stop and use a backoff, because an earlier respawn loop produced about 166 "bind failed" errors in one hour.

## Acceptance criteria

- [ ] A refused connection and a timeout show different copy, covered by a test for each.
- [ ] The banner names the project and origin; the Retry result says what was probed.
- [ ] A copyable restart command is shown for the down project, derived from its configured port and launchd job when one exists.
- [ ] Decision recorded in the task: whether `repoos-watchdog` should cover every project's serve job (with the same consecutive-miss threshold), and how it knows a stop was intentional.
- [ ] Docs: the server-down troubleshooting note explains refused vs timeout and the restart command.

## Notes for AI

- Do not auto-restart from the browser, and do not add a restart endpoint that runs when the server is down (it cannot be reached).
- Keep the copy plain English; see the UI copy rules in `AGENTS.md`.
- Reproduce with the Divot server stopped (`launchctl bootout`/SIGTERM on its pid) and with a stalled server (a test hook that delays `/api/health`).

## Activity

- 2026-10-25T12:30:39Z · created · njachowski@gmail.com
- 2026-10-28T16:39:40Z · status inbox→ready
