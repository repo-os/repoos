---
id: "0004"
title: "Fix task drawer scroll jump on long notes"
type: bug
status: active
priority: p0
area: web
assigned_to: ""
created_by: ""
branch: "feat/0004-drawer-scroll"
created_at: "2026-08-04T09:00:00Z"
updated_at: "2026-08-06T09:20:00Z"
---
## Activity

- 2026-08-04T09:00:00Z · created · unknown
- 2026-08-05T14:00:00Z · set status active · unknown

## Problem

Opening a task with a long body snaps the drawer to the bottom of the note
instead of the top, and resizing the drawer while scrolled loses position.

## Desired UX

- The drawer opens scrolled to the top of the task body.
- Position is preserved across drawer resize and tab switches.

## Acceptance criteria

- [ ] Open a 500-line task → body starts at the first line, not the last.
- [ ] Resize the drawer mid-scroll → the same paragraph stays in view.
