---
id: "0728"
title: "Event-driven CTO: react to server events instead of a timer, and expose the same feed as a watch command for external sessions"
type: feature
status: ready
priority: p1
area: [cli, server]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/event-driven-cto-react-to-server-events-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T02:05:33Z"
updated_at: "2026-10-07T10:43:12Z"
---
## Problem

The CTO polled status every few minutes with timers; missed timers cost about 6 hours on 2026-10-07, and there was no way to notice that a CTO had stopped.

## Desired UX

- /api/events (SSE) already exists. Document a stable contract for the events a CTO needs (task status changes, handoff/review/close-out results with cause, agent exits with reason, host slow-run and hang alerts) and make sure each carries task id, cause and evidence links.
- A `repoos watch [--json] [--task <id>]` command that streams those events with auto re-login after server reloads (depends on #0723 session handling) and exits non-zero when the server is unreachable.
- A CTO heartbeat: the CTO (or its supervisor) can post 'CTO alive' and the attention feed raises 'CTO silent N min' when a board has actionable items and no heartbeat.

## Acceptance criteria

- Tests: events carry the documented fields; watch survives a server reload; the heartbeat alert fires and clears. Docs (user-docs/running-with-agents.md: how to drive a board by events). repoos check passes.

## Notes for AI

Read src/server/events and the SSE route in server.ts first; verify which events already exist. Related: #0723, #0720.

## Framing (2026-10-07)

The CTO monitor wakes on ctoMonitorIntervalMs (a timer; 5 min here). Move it to event-driven wake-ups (with the timer only as a backstop), so it reacts to a review going green, a close-out failing or an agent exiting. The "driver heartbeat" below becomes a CTO-liveness alert: the attention feed raises 'CTO silent' when actionable items exist and the CTO has not acted. The watch command is for human-chosen external sessions, not a second automation role.

## Activity

- 2026-10-07T02:05:33Z · created · unknown
- 2026-10-07T02:10:58Z · story
- 2026-10-07T02:11:12Z · title, body
- 2026-10-07T09:11:18Z · status inbox→ready
- 2026-10-07T09:46:37Z · cli_override, model_override
- 2026-10-07T09:46:37Z · status ready→active, branch
- 2026-10-07T10:43:12Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
