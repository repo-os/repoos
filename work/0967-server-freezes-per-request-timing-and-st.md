---
id: "0967"
title: "Server freezes: per-request timing and STUCK log"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
debug_tldr: "Scoped check's test step hit its 15-minute limit (the live-board status test also timed out), so handoff never happened. Run the check on a quieter machine or narrow the test selection, then retry."
debug_tldr_at: "2026-10-27T14:16:10Z"
debug_tldr_key: dev-error|the agent process exited with an error — open the task to see the full output
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
updated_at: "2026-10-27T14:20:49Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"grok-4.7-low\",\"at\":\"2026-10-27T14:15:32.454Z\",\"kind\":\"dev-error\"}]"
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
