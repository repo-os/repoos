---
id: "1113"
title: Build a single-column mobile Work queue
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX, Notes for AI"
priority: p1
area: web
depends_on: ["1111"]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-14T09:10:48Z"
updated_at: "2026-11-14T09:10:51Z"
---
## Problem
The desktop Work board uses dense multi-column scanning and pointer-oriented interactions. It is difficult to scan and operate on a phone.

## Desired outcome
Below the mobile breakpoint, Work is a readable vertical task queue with obvious creation, filtering and sorting controls. Desktop Work remains intact.

## Acceptance criteria
- Implement a dedicated mobile Work composition; do not reuse desktop board DOM/CSS for the narrow queue.
- Show task number, title, type, priority, status and updated time on each readable wrapping card.
- Provide a prominent touch-sized New task action wired to existing creation flow and shared mutation.
- Provide compact status filtering and updated-time sorting, with an obvious reset to the unfiltered queue.
- Reuse the active shared task store and existing loading, mutation, network error and retry behavior.
- Ensure every action is usable without hover and the page has no horizontal overflow.
- Add coverage for card content, queue states (loading, empty, filtered-empty, error/retry), create flow and desktop unaffected behavior.

## Activity

- 2026-11-14T09:10:48Z · created · t@t
- 2026-11-14T09:10:51Z · needs_input
