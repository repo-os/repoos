---
id: "1215"
title: "QA pass: task create and edit flows at all screen sizes"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T03:17:33Z"
updated_at: "2026-11-19T03:17:33Z"
---
## Problem
Task creation and editing (new task drawer, edit fields, attachments, screenshots) has not had a QA pass at phone, tablet and desktop widths.
## Desired UX
Every field, validation message and button works and is reachable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Exercise create, edit, depends-on, priority, area and screenshot attach using fixtures; fix layout, wording and dead controls with tests.
- Commit docs/qa/2026-11-task-create-edit-qa.md listing what was checked.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T03:17:33Z · created · t@t
