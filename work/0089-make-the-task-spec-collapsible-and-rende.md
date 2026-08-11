---
id: "0089"
title: Make the task spec collapsible and render its Markdown
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/make-the-task-spec-collapsible-and-rende
created_at: "2026-08-11T13:34:35Z"
updated_at: "2026-08-11T14:30:15Z"
---
## Problem

The spec field in the task sidebar is always expanded and displays raw Markdown even when it is not being edited. This makes the sidebar less compact and the task specification harder to read.

## Desired UX

The spec field in the task sidebar can be expanded or collapsed. When the field is in read mode, its Markdown is rendered for a polished, readable presentation. When the field is in edit mode, the raw Markdown remains visible and editable.

## Acceptance criteria

- [ ] The spec field in the task sidebar has a control to expand and collapse it.
- [ ] The spec field displays rendered Markdown when it is not in edit mode.
- [ ] The spec field displays raw Markdown when it is in edit mode.
- [ ] Switching between read and edit modes preserves the spec content.
- [ ] Collapsing and expanding the spec field does not alter its content.

## Notes for AI

- Limit the change to the task sidebar's spec field and its read/edit presentation.
- Use the UI's existing interaction and styling patterns where applicable.
- Assume the spec field's initial expanded or collapsed state should follow the most consistent existing sidebar pattern.
- Do not render formatted Markdown inside the editing control; editing must continue to expose the raw source.

## Activity

- 2026-08-11T13:34:35Z · created · unknown
- 2026-08-11T13:34:57Z · status inbox→ready
- 2026-08-11T13:46:09Z · status ready→active, branch
- 2026-08-11T14:30:15Z · status active→ready
