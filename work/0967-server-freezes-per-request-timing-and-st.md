---
id: "0967"
title: "Server freezes: per-request timing and STUCK log"
type: feature
status: active
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
updated_at: "2026-10-27T13:21:19Z"
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
