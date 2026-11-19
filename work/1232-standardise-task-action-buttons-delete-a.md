---
id: "1232"
title: "Easter eggs bundle: task action button labels (Delete, Archive, Hold)"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T13:54:07Z"
updated_at: "2026-11-19T13:54:25Z"
---
## Problem
The task drawer footer buttons read "Delete task", "Archive task" and "Hold". The word "task" is redundant (the drawer is already a task) and the three are inconsistent.
## Desired UX
The drawer footer buttons read exactly "Delete", "Archive" and "Hold" (and "Release hold" when held, "Unarchive" when archived). The confirmation dialogs keep clear wording, and their confirm buttons also drop the word task ("Delete", "Archive", "Hold") while their titles stay "Delete task?", "Archive task?", "Hold task".
## Acceptance criteria
- Update src/ui-app/src/components/TaskDrawer.vue (around lines 6775-6794), DeleteTaskDialog.vue, ArchiveTaskDialog.vue and HoldTaskDialog.vue confirm buttons, and any other task-action button using the same labels.
- Update tests, docs and user-docs that quote the old labels (grep "Delete task", "Archive task").
- Headless Playwright only if verifying visually; never open a visible browser.
## Notes for AI
Do not touch repoos.toml. Keep aria-labels descriptive (e.g. aria-label "Delete task") so screen-reader users still hear what is affected.

## Activity

- 2026-11-19T13:54:07Z · created · t@t
- 2026-11-19T13:54:25Z · title
