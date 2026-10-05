---
id: "0303"
title: Build a touch-first mobile Work queue and task detail flow
type: feature
status: ready
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p1
area: mobile
story: RepoOS Hub for Mobile
depends_on: ["0302"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-26T16:45:58Z"
updated_at: "2026-10-05T22:38:17Z"
---
## Problem

The desktop Work board is optimized for columns and density. Reusing it unchanged on a phone will make the primary mobile workflow cramped and difficult to scan.

## Desired outcome

Create a mobile-specific Work composition that makes task scanning, filtering, creating, and opening details comfortable with one hand while reusing the existing task data and mutations.

## Acceptance criteria

- [ ] Render a single vertical mobile task queue instead of the desktop multi-column board.
- [ ] Show readable task cards with task number, title, type, priority, status, and updated time.
- [ ] Provide a prominent touch-friendly New task action.
- [ ] Provide compact sort/filter controls with clear active-state feedback.
- [ ] Open task details in a mobile page or bottom sheet with appropriate back behavior.
- [ ] Remove reliance on hover-only actions and tiny icon controls.
- [ ] Preserve task mutations, live updates, and error states from the shared stores.
- [ ] Add responsive/component coverage for queue rendering, task opening, creation, and empty/loading/error states.

## Notes

Follow docs/mobile-ux-strategy.md. Do not force the desktop Work DOM and CSS to serve as the mobile layout.

## Activity

- 2026-08-26T16:45:58Z · created · unknown
- 2026-08-26T18:14:10Z · status inbox→ready
- 2026-09-17T15:13:33Z · status ready→inbox
- 2026-09-23T06:53:53Z · story
- 2026-10-02T09:03:05Z · depends_on
- 2026-10-02T09:09:43Z · status inbox→ready
- 2026-10-05T11:15:30Z · needs_input
