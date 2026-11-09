---
id: "1075"
title: "Tell the user when an installed upgrade is waiting for a restart, and offer Restart now"
type: feature
status: inbox
priority: p2
area: [web, server, cli]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T08:24:33Z"
updated_at: "2026-11-09T08:24:33Z"
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

## Activity

- 2026-11-09T08:24:33Z · created · njachowski@gmail.com
