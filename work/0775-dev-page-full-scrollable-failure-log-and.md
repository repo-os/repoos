---
id: "0775"
title: "Dev page: full scrollable failure log and a plain-language failure summary"
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/dev-page-full-scrollable-failure-log-and
created_at: "2026-10-14T04:59:42Z"
updated_at: "2026-10-14T06:03:39Z"
---
## Problem
When a dev target fails, the Dev page shows only the last 5-6 lines of output. The Landing page (HMR) failure on 2026-10-14 showed only the Node stack trace, and the cause (port 5173 already in use, held by an orphaned vite process from Oct 12 with --strictPort) was not stated anywhere on the page.

## Desired UX
- The 'Last output' panel is scrollable and shows the full captured output for the last run (within a sane cap, e.g. the last 2000 lines), not just a tail.
- A plain-language failure summary above the log: what failed, the most likely cause, and how to fix it. Deterministic detection comes first (for example 'Port 5173 is already in use' with the PID holding it and whether it is a stale process from an earlier run). An AI-written summary is an optional extra.
- **Port handling:**
- Auto-pick a free port is ON by default. When the target's port is taken, RepoOS starts the target on the next free port and shows the real URL prominently.
- A setting per dev target lets the user turn auto-pick OFF and enter a fixed port. With auto-pick off, a port conflict fails with the plain-language summary, naming the process holding the port.
- Auto-pick never stops another process to free a port. Only processes RepoOS started may be stopped. Anything else is shown with its PID and command for the user to decide.
- A Stop action appears only for processes RepoOS started.

## Acceptance criteria
- Scrollable full log in light and dark themes; keyboard accessible.
- Port conflict with auto-pick on: the target starts on a free port and the UI shows that port and URL.
- Port conflict with auto-pick off: the target fails with the port-in-use summary, the holder's PID and command.
- Tests: port conflict detection, auto-pick selection, summary text, log cap, auto-pick setting off with a fixed port.
- Every new user-facing setting (auto-pick default, per-target port, AI summary toggle) has a Settings control, and the copy says what happens when a port is taken (AGENTS.md).

## Notes for AI
Start from the Dev page view and the dev supervisor (#0747 dev target config and supervisor, #0748 Dev page). Source: user report, 2026-10-14, Landing page (HMR) failure, and the decision on port handling from the same day.

## Activity

- 2026-10-14T04:59:42Z · created · njachowski@gmail.com
- 2026-10-14T05:05:57Z · status inbox→ready
- 2026-10-14T05:06:01Z · status ready→active, branch
- 2026-10-14T05:15:16Z · message_queued at 2026-10-14T05:15:16.926Z
- 2026-10-14T05:15:17Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-14T05:44:30Z · body
- 2026-10-14T05:45:59Z · body
- 2026-10-14T05:47:50Z · body
- 2026-10-14T05:50:51Z · body
- 2026-10-14T05:52:26Z · body: section Shots
- 2026-10-14T05:54:59Z · body
- 2026-10-14T05:59:22Z · body
- 2026-10-14T06:02:23Z · status active→review
- 2026-10-14T06:03:39Z · note: review pass 1: needs some work
