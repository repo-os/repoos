---
id: "0198"
title: Auto-launch preview servers for tasks in review state
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-14T12:52:34Z"
updated_at: "2026-08-14T12:58:17Z"
---
## Problem

Preview server manual launch is error-prone and adds unnecessary friction to the review workflow. Users frequently encounter "preview server did not become ready" errors when clicking the preview button, which blocks the review process. Manual button clicks are unnecessary overhead when task state transitions are already trackable.

## Desired UX

Preview servers automatically launch when tasks transition to review state and automatically close when tasks move to done state. Users never need to manually click a preview button. At most 3–4 preview servers run concurrently to conserve resources, with older previews being terminated as new tasks enter review.

## Acceptance criteria

- [ ] Preview server automatically launches when a task status changes to "review"
- [ ] Preview server automatically closes when a task status changes to "done"
- [ ] System maintains a maximum of 3–4 concurrent preview servers
- [ ] When the limit is reached, the oldest running preview is terminated before a new one starts
- [ ] Preview button is removed or disabled from the UI (or disabled when preview is already running)
- [ ] Failed preview server launches are logged and do not crash the system
- [ ] Preview server lifecycle is logged with task ID and timestamps

## Notes for AI

- Assume task state transitions are emitted via an event system or webhook; discover and integrate with existing state management
- "Review" and "done" are task statuses; confirm these exact status strings in the codebase
- The 3–4 concurrent limit is a hard constraint; implement a FIFO queue if the limit is exceeded
- Consider graceful shutdown: ensure preview servers are killed cleanly on close and no orphaned processes remain
- The error "preview server for #XXXX did not become ready" may be symptomatic of the current button-click approach; it should be eliminated entirely by automation
- Do not invent new UI for manual control; automation is the goal

## Scope

**Included:** Auto-launch on review state, auto-close on done state, concurrent limit enforcement, logging

**Deferred:** UI for manual preview control, preview server upgrade/improvements, metrics/analytics on preview usage

## Activity

- 2026-08-14T12:52:34Z · created · unknown
- 2026-08-14T12:58:17Z · status inbox→ready
