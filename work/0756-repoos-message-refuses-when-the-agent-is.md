---
updated_at: "2026-10-10T17:17:21Z"
review_passes: 1
id: "0756"
title: repoos message refuses when the agent is busy instead of queuing it
type: bug
status: review
priority: p1
area: infra
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-message-refuses-when-the-agent-is
cli_override: claude code
model_override: haiku
created_at: "2026-10-10T14:10:58Z"
last_check_failure: "repoos check at 2026-10-10T15:58:58.515Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
---
## Problem

`repoos message <id> "..."` fails with "agent is busy — wait for the current turn or handoff to finish" when the task's engineer is mid-turn. The message is dropped, not queued, so nothing tells the engineer to act and nothing retries.

This lost an instruction on Divot's #0028 (notch padding). A correction sent to the engineer during a review was refused, and it had to be re-sent later. Meanwhile the engineer had been working from an earlier, wrong instruction.

## Evidence

- Project: `~/code/nick/divot`, task #0028, commits `0a87954` and later.
- Repeated refusals during the 21:19 to 22:08 window on 2026-10-10, each time the task was in review or active.

## Desired behaviour

- A message sent to a busy agent is queued and delivered at the start of its next turn, in order, with a visible "queued" status on the task.
- The CLI reports that the message is queued, not that it was refused.
- A queued message that is never delivered within a timeout is flagged on the task so the PM sees it.

## Acceptance criteria

- `repoos message` returns "queued" for a busy agent, and the message is delivered at the next turn start.
- Queued messages are delivered in order and each is delivered exactly once.
- The task activity log records queued, delivered, and expired messages.
- A test covers a message sent while busy, delivery on the next turn, and the timeout flag.
- `repoos check` passes.

## Notes for AI

This is delivery behaviour in the message path, not a new API. Do not change how review or close-out decide pass or fail.

## Activity

- 2026-10-10T14:10:58Z · created · njachowski@gmail.com
- 2026-10-10T14:12:21Z · status inbox→ready
- 2026-10-10T14:12:39Z · cli_override, model_override
- 2026-10-10T14:12:40Z · model_override
- 2026-10-10T14:12:46Z · status ready→active, branch
- 2026-10-10T15:03:21Z · body
- 2026-10-10T15:04:34Z · body
- 2026-10-10T15:06:38Z · body
- 2026-10-10T15:07:17Z · body
- 2026-10-10T15:08:38Z · body
- 2026-10-10T17:09:35Z · body
- 2026-10-10T17:10:14Z · body
- 2026-10-10T17:16:29Z · status active→review
- 2026-10-10T17:16:29Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-10T17:17:21Z · note: review pass 1: needs some work

