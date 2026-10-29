---
id: "0983"
title: "A queued check is 'waiting', not 'needs input', so engineers keep going"
type: bug
status: review
priority: p1
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/a-queued-check-is-waiting-not-needs-inpu
cli_override: codex
model_override: gpt-6.1-sol
created_at: "2026-10-29T15:23:58Z"
updated_at: "2026-10-29T22:40:12Z"
---
## Problem
#0974's check-wait escalation sets `needs_input` (reason `check-wait`) when a check has waited 10 minutes for a slot or the pressure guard. Engineers read "needs input" as blocked and end their turn: on 2026-10-29 #0980 and #0982 finished their code, waited for a check slot, were flagged, and stopped, so the driver had to land both by hand. A queued check is normal and expected; it is not a request for human input.

## Desired UX
A long queue wait is visible but does not stop the engineer. The task card shows "waiting for a check slot · N min" (or the pressure reason); the engineer keeps waiting and hands off when the check passes. Only a wait that looks broken (holder dead, no progress for a long time) asks for a human.

## Acceptance criteria
- A check waiting on a live slot holder or the pressure guard sets a separate, non-blocking state (for example `waiting_reason`/`waiting_since`), not `needs_input`. The card and drawer show it.
- `needs_input` is raised only when the wait is abnormal: the slot holder is dead or has made no progress for 30 minutes, or the wait exceeds the handoff deadline.
- The engineer's context pack / AGENTS.md says a queued check is normal: keep waiting, do not end the turn.
- Tests: a 15-minute wait behind a live holder does not set needs_input; a dead holder does; the waiting state clears when the check starts.

## Notes for AI
`src/server/task-watchdog.ts` (`escalateStaleQueueWaits`, `escalateCheckWait`), `src/core/check-wait.ts`, task card status in `src/ui-app/src/components/TaskCard.vue`. Do not edit repoos.toml.

## Activity

- 2026-10-29T15:23:58Z · created · njachowski@gmail.com
- 2026-10-29T15:24:02Z · cli_override, model_override
- 2026-10-29T15:24:07Z · status inbox→ready
- 2026-10-29T17:38:37Z · status ready→active, branch
- 2026-10-29T22:40:12Z · status active→review
