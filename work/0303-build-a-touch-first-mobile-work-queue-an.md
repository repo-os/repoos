---
id: "0303"
title: Build a touch-first mobile Work queue and task detail flow
type: feature
status: ready
priority: p1
area: mobile
story: RepoOS Hub for Mobile
depends_on: ["0302"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-26T16:45:58Z"
updated_at: "2026-10-07T14:01:49Z"
---
## Problem

The desktop Work board is optimized for dense multi-column scanning and pointer interactions. On a phone, those columns become cramped, task information is difficult to scan, and hover-dependent or tiny controls are awkward to use. The connected-server mobile shell in task #0302 provides navigation, but its primary Work destination still needs a composition designed around a narrow viewport and touch. Reuse RepoOS's existing task data and behavior without making the desktop board responsible for mobile layout.

## Desired UX

When a user opens Work on a phone, they see a readable, scrollable single-column queue for the active server, with an obvious New task action and compact controls for finding and sorting tasks. Opening a card presents its details in a mobile-appropriate navigation page or sheet; returning restores the user's place and queue settings.

## Acceptance criteria

- [ ] In the connected-server mobile shell, render Work as a dedicated single vertical task queue; do not reuse the desktop multi-column board DOM/CSS as the mobile composition. Keep the existing desktop Work experience intact.
- [ ] Each task card displays its task number, title, type, priority, status, and a human-readable updated time. Text must remain readable when titles wrap or device width is narrow.
- [ ] Provide a prominent, comfortably tappable New task action that opens the existing task-creation flow and uses the shared create mutation. After successful creation, the new task is visible in the queue; creation failures remain visible and recoverable.
- [ ] Provide compact controls to filter by task status and sort by update time. Default to most recently updated first; show the active filter and sort clearly, and provide an obvious way to return to the unfiltered queue.
- [ ] Tapping a task opens its details in a mobile navigation page or bottom sheet. Back navigation, including the platform back behavior supported by the shell, returns to the queue and retains its filter, sort, and scroll position.
- [ ] All queue and detail actions are usable by touch without hover-only affordances or tiny icon-only controls.
- [ ] Use the active server's shared task store and existing mutations. Live task updates are reflected in the queue and details, and loading, mutation, and network errors use the existing error-reporting behavior rather than being hidden or replaced with success states.
- [ ] Add responsive/component coverage for card content and queue rendering, opening and returning from task details, creating a task, and loading, empty, filtered-empty, and error/retry states. Include a check that the desktop board remains unaffected.

## Notes for AI

Read `docs/mobile-ux-strategy.md` and the connected-server shell contract in task #0302 before implementation. Build a mobile-specific Work composition that fits the shell's navigation primitives; do not add mobile-only layout decisions to the desktop board. Inspect and reuse the existing task store, creation flow, detail behavior, shared formatters, and mutation/error handling rather than duplicating their business logic. Use the task domain's supported statuses, types, and priorities. Keep server APIs and multi-server lifecycle/session behavior out of scope; align tests with the harness established by task #0300 when available.

## Activity

- 2026-08-26T16:45:58Z · created · unknown
- 2026-08-26T18:14:10Z · status inbox→ready
- 2026-09-17T15:13:33Z · status ready→inbox
- 2026-09-23T06:53:53Z · story
- 2026-10-02T09:03:05Z · depends_on
- 2026-10-02T09:09:43Z · status inbox→ready
- 2026-10-05T11:15:30Z · needs_input
- 2026-10-07T14:00:01Z · needs_input
- 2026-10-07T14:01:49Z · body
