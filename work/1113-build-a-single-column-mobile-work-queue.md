---
id: "1113"
title: Build a single-column mobile Work queue
type: feature
status: active
priority: p1
area: web
depends_on: ["1112"]
assigned_to: ai
created_by: t@t
branch: feat/build-a-single-column-mobile-work-queue
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:10:48Z"
updated_at: "2026-11-14T13:41:49Z"
---
## Problem
The desktop Work board uses dense multi-column scanning and pointer-oriented interactions. It is difficult to scan and operate on a phone.

## Desired UX
Below the mobile breakpoint, Work is a readable vertical task queue with obvious creation, filtering and sorting controls. Desktop Work remains intact.

## Acceptance criteria
- Implement dedicated mobile Work composition; do not reuse desktop board DOM/CSS for the narrow queue.
- Show task number, title, type, priority, status and updated time on readable wrapping cards.
- Provide prominent touch-sized New task action wired to existing creation flow and shared mutation.
- Provide compact status filtering and updated-time sorting, with an obvious reset to the unfiltered queue.
- Reuse active shared task store and existing loading, mutation, network error and retry behavior.
- Ensure every action works without hover and the page has no horizontal overflow.
- Add coverage for card content, loading/empty/filtered-empty/error-retry states, create flow and desktop unaffected behavior.
## Notes for AI
Read ADR 0011 and the shell contract in #1112. Inspect and reuse the existing task store, creation flow, formatters and mutation handling. Keep server/session behavior out of scope.

## Shots
```json
[
{
"label": "Single-column mobile Work queue",
"target": "default",
"route": "/work",
"highlight": "[data-testid=\"mobile-work-queue\"]"
}
]
```

## Activity

- 2026-11-14T09:10:48Z · created · t@t
- 2026-11-14T09:10:51Z · needs_input
- 2026-11-14T09:11:40Z · depends_on, body: Desired UX (added); Acceptance criteria (added 6, removed 6); Notes for AI (added); Desired outcome (removed)
- 2026-11-14T09:22:34Z · needs_input
- 2026-11-14T13:18:48Z · cli_override, model_override
- 2026-11-14T13:18:53Z · status inbox→ready
- 2026-11-14T13:18:56Z · status ready→active, branch
- 2026-11-14T13:23:22Z · body
- 2026-11-14T13:32:39Z · body
- 2026-11-14T13:37:31Z · body
- 2026-11-14T13:41:49Z · CTO nudge: held — handoff gate is running
