---
id: "0967"
title: "Server freezes: per-request timing and STUCK log"
type: feature
status: done
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/server-freezes-per-request-timing-and-st
cli_override: cursor
model_override: grok-4.7-low
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-27T12:02:49Z"
updated_at: "2026-10-27T22:11:16Z"
review_rounds: 1
review_passes: 1
dev_error_count: 1
---
## Problem
Split from #0962. When the server stalls there is no record of which request or git call was slow, so every freeze is diagnosed by guesswork.

## Desired UX
Every slow request leaves a clear log line naming the route and what it was waiting on.

## Acceptance criteria
- [ ] Every HTTP request logs its duration (debug level; warn above 2 s).
- [ ] A request open longer than 10 s logs `STUCK <route>` plus the in-flight git calls and their age.
- [ ] Test with a fake slow handler proves both lines.

## Notes for AI
Independent and small. No server restarts, no previews, no repoos.toml edits.

## Activity

- 2026-10-27T12:02:49Z · created · njachowski@gmail.com
- 2026-10-27T13:20:22Z · status inbox→active
- 2026-10-27T13:20:30Z · cli_override, model_override
- 2026-10-27T13:20:37Z · review_cli_override, review_model_override
- 2026-10-27T13:20:38Z · branch
- 2026-10-27T13:20:50Z · message_queued at 2026-10-27T13:20:50.752Z
- 2026-10-27T13:21:19Z · review_cli_override, review_model_override
- 2026-10-27T14:15:32Z · agent exited with an error (cursor) · the agent process exited with an error — open the task to see the full output
- 2026-10-27T14:15:32Z · engineer crash recovery: resuming cursor + grok-4.7-low (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-27T14:15:40Z · message_delivered: 1 message(s)
- 2026-10-27T14:20:49Z · engineer stopped by request
- 2026-10-27T14:20:50Z · needs_input
- 2026-10-27T20:23:26Z · message_queued at 2026-10-27T20:23:26.496Z
- 2026-10-27T21:31:00Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-27T21:31:00Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-27T21:31:00Z · message_delivered: 1 message(s)
- 2026-10-27T22:04:37Z · status active→review
- 2026-10-27T22:04:39Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-27T22:05:37Z · note: review pass 1: needs some work
- 2026-10-27T22:05:38Z · status review→active
- 2026-10-27T22:06:30Z · engineer stopped by request
- 2026-10-27T22:11:16Z · status active→done
