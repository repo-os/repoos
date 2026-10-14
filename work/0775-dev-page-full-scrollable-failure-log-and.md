---
id: "0775"
title: "Dev page: full scrollable failure log and a plain-language failure summary"
type: feature
status: inbox
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-14T04:59:42Z"
updated_at: "2026-10-14T04:59:42Z"
---
## Problem
When a dev target fails, the Dev page shows only the last 5-6 lines of output. The Landing page (HMR) failure on 2026-10-14 showed only the Node stack trace, and the cause (port 5173 already in use, held by an orphaned vite process from Oct 12 with --strictPort) was not stated anywhere on the page.

## Desired UX
- The 'Last output' panel is scrollable and can show the full captured output for the last run (within a sane cap, e.g. the last 2000 lines), not just a tail.
- A plain-language failure summary above the log: what failed, the most likely cause, and how to fix it. Start with deterministic detection (for example 'Port 5173 is already in use' with the PID holding it, and whether it is a stale process from an earlier run), then offer an AI-written summary as an optional extra.
- Detected-port conflicts offer a Stop action for the process holding the port, but only for processes RepoOS started; anything else is shown with the PID and the command for the user to decide.

## Acceptance criteria
- Scrollable full log in light and dark themes; keyboard accessible.
- Port-in-use failures produce the plain-language summary with the holder's PID and command, without needing the AI.
- Tests: port conflict detection, summary text, log cap.
- Any new user-facing setting (for example the AI summary toggle) gets a Settings control (AGENTS.md).

## Notes for AI
Start from the Dev page view and the dev supervisor (#0747 dev target config and supervisor, #0748 Dev page). Source: user report, 2026-10-14, Landing page (HMR) failure.

## Activity

- 2026-10-14T04:59:42Z · created · njachowski@gmail.com
