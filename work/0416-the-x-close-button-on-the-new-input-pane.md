---
id: "0416"
title: Align new input panel buttons with standard positioning
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-18T14:45:27Z"
updated_at: "2026-09-18T14:45:52Z"
---
## Problem
The "new input" panel's button layout is inconsistent with the standard panel design used throughout the application. The close button [x] is not positioned in the top right corner, and the action buttons are positioned on the left side instead of the right side.

## Desired UX
- Close button [x] positioned in the top right corner, matching other closable panels
- Action buttons ("do nothing" and "create task") positioned on the right side of the panel
- "Create task" button positioned as the rightmost button, with "do nothing" to its left

## Acceptance criteria
- [ ] Close button is positioned in the top right corner of the new input panel
- [ ] Action buttons are positioned on the right side of the panel
- [ ] "Create task" button is the rightmost button
- [ ] "Do nothing" button is positioned to the left of "create task"
- [ ] Button layout is consistent with other panels in the application

## Notes for AI
This is a UI layout alignment task. Locate the new input panel component and adjust its button positioning to match the standard layout used throughout the application. No functional changes are needed—this is purely visual alignment.

## Original prompt

The [x] close button on the "new input" panel should be in the top right corner like all the other close panel buttons everywhere else. Also the "create task" and "do nothing" buttons should be on the right hand side of the input panel, not on the left hand side, and "create task" button should be furthest to the right.

## Screenshots

![Screenshot-2026-09-18-at-22.42.40](/api/tasks/0416/attachments/screenshot-1.png)
![Screenshot-2026-09-18-at-22.41.54](/api/tasks/0416/attachments/screenshot-2.png)

## Activity

- 2026-09-18T14:45:27Z · created · hello@repoos.org
- 2026-09-18T14:45:28Z · screenshots
- 2026-09-18T14:45:28Z · screenshots
- 2026-09-18T14:45:52Z · status draft→inbox, title, area, body
