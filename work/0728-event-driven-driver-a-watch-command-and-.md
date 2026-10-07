---
last_close_out_gate_ms: 432851
last_close_out_gate_at: "2026-10-07T10:40:09.367Z"
id: "0728"
title: "Event-driven CTO: react to server events instead of a timer, and expose the same feed as a watch command for external sessions"
type: feature
status: review
priority: p1
area: [cli, server]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/event-driven-cto-react-to-server-events-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T02:05:33Z"
updated_at: "2026-10-07T10:40:09Z"
review_passes: 1
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

## Driver constraints for engineer and reviewer

Owner wants release soon. Verify diagnosis independently against CURRENT main and running build before implementation/approval; record commit/version and reproduction, classify external RepoOS-managed repo reports as still relevant, partly fixed, already fixed, or misdiagnosed. Do not implement stale reports blindly. These two tasks share attention-feed/CTO surfaces: preserve independent responsibilities and coordinate via task notes; no concurrent writer in a worktree. #0729 runner repair is release-critical, do not overwrite installed runner guards or change owner config/hosts/restart server. Build after UI/source changes BEFORE one scoped repoos check --changed main; handoff runs the full gate. If only one local step fails, rerun that step instead of the entire passing suite. Request handoff ONCE, then END TURN with no subsequent commits/task updates. Required UI shots must show actual changed screens/state; temporary browser route-interception fixtures stay outside production code and are labeled. No release/tag/push/PR/direct-main commit.

## Activity

- 2026-10-07T02:05:33Z · created · unknown
- 2026-10-07T02:10:58Z · story
- 2026-10-07T02:11:12Z · title, body
- 2026-10-07T09:11:18Z · status inbox→ready
- 2026-10-07T09:46:37Z · cli_override, model_override
- 2026-10-07T09:46:37Z · status ready→active, branch
- 2026-10-07T09:47:41Z · body
- 2026-10-07T09:55:53Z · body
- 2026-10-07T10:11:17Z · status active→review
- 2026-10-07T10:11:17Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-07T10:12:07Z · note: review pass 1: good to go
- 2026-10-07T10:40:09Z · close-out gate completed in 433s

