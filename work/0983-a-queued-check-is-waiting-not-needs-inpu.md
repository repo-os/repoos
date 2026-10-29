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
updated_at: "2026-10-29T22:43:51Z"
last_check_failure: "repoos check at 2026-10-29T22:14:27.382Z: repoos check failed: tests — stderr | tests/freeform-submit-ack.test.ts > new task screenshot draft persistence (0510) > keeps pending screenshots across close and reopen"
handoff_signal_retry_count: 1
incomplete_review_retries: 1
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

## Shots
```json
[
{
"label": "Normal 15-minute check wait stays non-blocking on the card",
"target": "default",
"route": "/work",
"highlight": ".tc-queued",
"state": "checks:waiting"
},
{
"label": "Drawer shows check slot waiting reason and elapsed time",
"target": "default",
"route": "/work?task=9999",
"highlight": ".drawer-status-chip",
"state": "checks:waiting"
}
]
```

## Activity

- 2026-10-29T15:23:58Z · created · njachowski@gmail.com
- 2026-10-29T15:24:02Z · cli_override, model_override
- 2026-10-29T15:24:07Z · status inbox→ready
- 2026-10-29T17:38:37Z · status ready→active, branch
- 2026-10-29T18:26:16Z · body
- 2026-10-29T21:21:46Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T22:40:13Z · status active→review
- 2026-10-29T22:40:14Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (459c56a6c) during finalization (#0734)
- 2026-10-29T22:43:51Z · note: review pass 1: incomplete — no verdict in report

