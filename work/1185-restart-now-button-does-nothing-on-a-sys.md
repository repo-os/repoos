---
id: "1185"
title: Restart now button does nothing on a systemd-managed server (misdetected as hand-run)
type: bug
status: inbox
priority: p1
area: [web, server]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T12:27:18Z"
updated_at: "2026-11-18T12:27:18Z"
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

## Activity

- 2026-11-18T12:27:18Z · created · t@t
