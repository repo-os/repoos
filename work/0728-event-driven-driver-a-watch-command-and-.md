---
id: "0728"
title: "Event-driven driver: a watch command and event contract so a driver reacts to events instead of polling"
type: feature
status: inbox
priority: p1
area: [cli, server]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-07T02:05:33Z"
updated_at: "2026-10-07T02:10:58Z"
---
## Problem

The driver polled status every few minutes with timers; missed timers cost about 6 hours on 2026-10-07, and there was no way to notice that a driver had stopped.

## Desired UX

- /api/events (SSE) already exists. Document a stable contract for the events a driver needs (task status changes, handoff/review/close-out results with cause, agent exits with reason, host slow-run and hang alerts) and make sure each carries task id, cause and evidence links.
- A `repoos watch [--json] [--task <id>]` command that streams those events with auto re-login after server reloads (depends on #0723 session handling) and exits non-zero when the server is unreachable.
- A driver heartbeat: the driver (or its supervisor) can post 'driver alive' and the attention feed raises 'driver silent N min' when a board has actionable items and no heartbeat.

## Acceptance criteria

- Tests: events carry the documented fields; watch survives a server reload; the heartbeat alert fires and clears. Docs (user-docs/running-with-agents.md: how to drive a board by events). repoos check passes.

## Notes for AI

Read src/server/events and the SSE route in server.ts first; verify which events already exist. Related: #0723, #0720.

## Activity

- 2026-10-07T02:05:33Z · created · unknown
- 2026-10-07T02:10:58Z · story
