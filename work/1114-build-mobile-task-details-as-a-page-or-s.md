---
id: "1114"
title: Build mobile task details as a page or sheet
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX, Notes for AI"
priority: p1
area: web
depends_on: ["1112"]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-14T09:10:53Z"
updated_at: "2026-11-14T09:10:55Z"
---
## Problem
The desktop task drawer shares a narrow viewport with the Work board and its tabs/actions are cramped on phones.

## Desired outcome
Opening a task from mobile Work presents readable task details in a mobile page or sheet and returns to the same queue state.

## Acceptance criteria
- Present task details in a dedicated mobile composition, reusing shared task data, store and mutations.
- Make title, status, task metadata, description and available actions readable and touch-usable without hover-only controls.
- Browser Back and the in-app return action return to Work with filter, sort and scroll position preserved.
- Any overlay is body-teleported and marked with data-overlay-layer; use shared dialog conventions.
- Keep the desktop task drawer unchanged.
- Cover opening/closing, mutation/error states and preserved queue state; confirm no horizontal overflow.

## Activity

- 2026-11-14T09:10:53Z · created · t@t
- 2026-11-14T09:10:55Z · needs_input
