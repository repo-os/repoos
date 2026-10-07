---
id: "0731"
title: Generate the CTO's board brief from live state (also usable as the handoff for any human or agent session)
type: feature
status: review
priority: p2
area: [cli, server]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/generate-the-cto-s-board-brief-from-live
created_at: "2026-10-07T02:05:40Z"
updated_at: "2026-10-07T17:40:41Z"
handoff_signal_retry_count: 1
---
## Problem

Driver rotation needed a hand-written handoff doc (state, open tasks, config changes made, hosts, rules, gotchas). It is slow to write and goes stale in minutes.

## Desired UX

- `repoos driver brief` (and an API) prints a current brief: merged tasks since the last tag with SHAs, tasks by status with their last event and cause, running agents, queued close-outs, host health and recent slow/hung runs, config keys changed since a baseline (from the config-change commits), the repo's AGENTS.md rules that matter to a driver, and the next recommended actions.
- Machine-readable (--json) so a new driver agent can load it; a 'driver notes' file in the repo (docs/ or work/ side, owner's choice) that drivers append lessons to, instead of private memory.

## Acceptance criteria

- Tests with a fixture board. Docs in user-docs/running-with-agents.md. repoos check passes.

## Notes for AI

Related: #0710 (docs lessons), #0723.

## Framing (2026-10-07)

The brief is produced by the CTO from live state (merged since the last tag, tasks by status with cause, running agents, queued close-outs, host health, config changes, next recommended actions). It replaces the hand-written handoff doc for human or external-agent rotation.

## Activity

- 2026-10-07T02:05:40Z · created · unknown
- 2026-10-07T02:06:12Z · note: Created as part of story 0009 (Autopilot).
- 2026-10-07T02:10:58Z · story
- 2026-10-07T02:11:16Z · title, body
- 2026-10-07T17:11:30Z · status inbox→ready
- 2026-10-07T17:12:04Z · status ready→active, branch
- 2026-10-07T17:21:56Z · body
- 2026-10-07T17:23:49Z · body
- 2026-10-07T17:40:41Z · status active→review
