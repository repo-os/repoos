---
id: "0123"
title: Add screenshot uploads to the New task panel
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-screenshot-uploads-to-the-new-task-p
created_at: "2026-08-12T05:52:42Z"
updated_at: "2026-08-12T11:08:04Z"
---
## Problem

The New task panel does not provide a way to attach screenshots. Users need to be able to add visual context while creating a task without leaving the panel.

## Desired UX

Users can add screenshots through a file upload control in the New task panel or by dragging and dropping a screenshot anywhere on the panel. Dropped or selected screenshots are added to the new task.

## Acceptance criteria

- [ ] The New task panel includes a control for selecting and uploading screenshots.
- [ ] Users can drag and drop a screenshot anywhere within the New task panel to add it.
- [ ] Screenshots added through file selection and drag-and-drop are attached to the new task.
- [ ] The panel provides visible feedback that a screenshot has been added.
- [ ] Existing New task panel behavior continues to work when no screenshot is added.

## Notes for AI

- Treat common image files as screenshots; the exact supported image formats should follow existing application conventions, if any.
- Assume multiple screenshots may be added to one new task unless the existing task data model only supports a single attachment.
- Reuse existing attachment or file-storage behavior if present.
- Keep both upload methods within the existing New task panel; do not introduce a separate upload flow.

## Activity

- 2026-08-12T05:52:42Z · created · unknown
- 2026-08-12T05:53:03Z · status inbox→ready
- 2026-08-12T11:08:04Z · status ready→active, branch
