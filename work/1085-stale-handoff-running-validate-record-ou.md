---
id: "1085"
title: Stale handoff 'running validate' record outlives its check and disables Move to done
type: bug
status: review
priority: p2
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stale-handoff-running-validate-record-ou
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-10T06:12:03Z"
updated_at: "2026-11-10T17:42:35Z"
---
## Problem
A task's handoff record can stay at `running` / step `validate` for hours after the work moved on. Seen on #1080 (handoff started 04:55Z, still "running validate" at 06:05Z even though review pass 8 was "good to go" and `repoos landable` was ready) and #1070 (same, ~30+ min). `repoos handoff-status <id>` keeps reporting running, and the board card shows "Checks · checking validate · 1h 11m" with "REVIEW PASSED · CHECKS RUNNING" and a greyed Move to done, which makes people think landing will fail.

## Likely cause
The handoff record is only cleared by the handoff pipeline finishing. When the status changes by another path (watchdog auto-surfaced the task, `repoos review again`, send-back, a review pass completing while the validate step is waiting on a serialized local check), nothing reconciles the stale record.

## Acceptance criteria
1. A handoff record that is not backed by a live check/handoff process, or whose task has since had a newer review verdict or status change, is cleared or marked `superseded`; `handoff-status` and the card then show the real state.
2. The card never shows "checks running" with an elapsed time longer than the check timeout without flagging it as stale.
3. Move to done is not disabled by a stale handoff record when `repoos landable` is ready.
4. Tests: stale running record + newer review pass; stale record with no live process.

## Notes for AI
Look at the handoff state store behind `repoos handoff-status` (src/server/handoff.ts), the watchdog (check-wait escalation) and the card state in the UI. Do not edit repoos.toml.

## Screenshots

![33](/api/tasks/1085/attachments/att_a0b0c8a0-ddb0-4469-85cc-ffe94a272b11.png)

## Activity

- 2026-11-10T06:12:03Z · created · njachowski@gmail.com
- 2026-11-10T06:12:03Z · screenshots
- 2026-11-10T06:12:05Z · needs_input
- 2026-11-10T13:33:39Z · status inbox→ready
- 2026-11-10T13:33:40Z · cli_override, model_override
- 2026-11-10T13:33:45Z · status ready→active, needs_input, branch
- 2026-11-10T13:49:27Z · message_queued at 2026-11-10T13:49:27.857Z
- 2026-11-10T13:49:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T13:54:27Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T14:04:28Z · CTO nudge: held — handoff gate is running
- 2026-11-10T17:31:10Z · CTO nudge: held — handoff gate is running
- 2026-11-10T17:31:19Z · status active→review
- 2026-11-10T17:42:35Z · note: ui verification passed: 1 shot captured with clean console
