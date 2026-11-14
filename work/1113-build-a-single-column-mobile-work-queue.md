---
id: "1113"
title: Build a single-column mobile Work queue
type: feature
status: inbox
priority: p1
area: web
depends_on: ["1112"]
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:10:48Z"
updated_at: "2026-11-14T13:18:48Z"
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

## Activity

- 2026-11-14T09:10:48Z · created · t@t
- 2026-11-14T09:10:51Z · needs_input
- 2026-11-14T09:11:40Z · depends_on, body: Desired UX (added); Acceptance criteria (added 6, removed 6); Notes for AI (added); Desired outcome (removed)
- 2026-11-14T09:22:34Z · needs_input
- 2026-11-14T13:18:48Z · cli_override, model_override
