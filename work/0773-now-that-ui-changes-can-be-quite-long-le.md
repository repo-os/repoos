---
id: "0773"
title: Split task Changes into UI and Code tabs
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-14T03:52:38Z"
updated_at: "2026-10-14T03:56:29Z"
---
## Problem

The task panel’s Changes tab can become lengthy when it includes UI changes, making the information harder to scan.

## Desired UX

The Changes tab has two subtabs: UI changes and Code changes. They use the same style as the subtabs on the debug tab. When the task has existing shots, UI changes is selected by default; otherwise, Code changes is selected.

## Acceptance criteria

- [ ] The task panel’s Changes tab separates UI changes and Code changes into subtabs.
- [ ] The subtabs use the same style as the subtabs on the debug tab.
- [ ] UI changes is selected by default when the task has existing shots.
- [ ] Code changes is selected by default when the task has no existing shots.

## Notes for AI

- Treat “existing shots” as shots already associated with the task.
- Keep the change focused on the Changes tab and its default subtab selection.

## Original prompt

Now that UI changes can be quite long, let's split `UI changes` and `Code changes` into sub tabs of the Changes tab on the task panel (use the same style as the sub tabs on the debug tab). You can default to UI changes selected when there are existing shots, otherwise default to code changes when there are not shots.

## Screenshots

![Screenshot-2026-10-14-at-10.33.13](/api/tasks/0773/attachments/screenshot-1.png)
![Screenshot-2026-10-14-at-10.33.23](/api/tasks/0773/attachments/screenshot-2.png)

## Activity

- 2026-10-14T03:52:38Z · created · hello@repoos.org
- 2026-10-14T03:52:40Z · screenshots
- 2026-10-14T03:52:40Z · screenshots
- 2026-10-14T03:52:57Z · status draft→inbox, title, area, body
- 2026-10-14T03:56:29Z · status inbox→ready
