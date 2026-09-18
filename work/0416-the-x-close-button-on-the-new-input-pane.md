---
id: "0416"
title: Align new input panel buttons with standard positioning
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-18T14:45:27Z"
updated_at: "2026-09-18T14:57:23Z"
---
## Problem
The close button positioning is inconsistent across all side panels (drawers on the right side of the screen). Some panels have the close button [x] properly positioned in the top right corner, while others—including the new input panel—have it positioned at the end of the title or elsewhere. Additionally, the new input panel's action buttons are positioned on the left side instead of the right side.

## Desired UX
- All right-side panels have the close button [x] positioned in the top right corner (not at the end of the title)
- New input panel: action buttons ("do nothing" and "create task") positioned on the right side
- "Create task" button positioned as the rightmost button, with "do nothing" to its left
- Consistent close button positioning across all closable panels

## Acceptance criteria
- [ ] All side panels/drawers on the right side have the close button in the top right corner
- [ ] Close button positioning is NOT at the end of the title text
- [ ] New input panel action buttons are positioned on the right side
- [ ] "Create task" button is the rightmost button in the new input panel
- [ ] "Do nothing" button is positioned to the left of "create task"
- [ ] Close button layout is consistent with standard panel design throughout the application

## Notes for AI
This is a UI layout alignment task. Audit all right-side panels/drawers for close button positioning and adjust as needed to use a consistent top right corner position. For the new input panel specifically, also adjust the action button positioning to match standard layouts. No functional changes are needed—this is purely visual alignment.

## Original prompt

The [x] close button on the "new input" panel should be in the top right corner like all the other close panel buttons everywhere else. Also the "create task" and "do nothing" buttons should be on the right hand side of the input panel, not on the left hand side, and "create task" button should be furthest to the right.

Additionally: ensure any and all side panels (on the right side of the screen) have the close button in the top right corner, as some panels may have the close button positioned at the end of the title instead of the proper top right corner.

## Screenshots

![Screenshot-2026-09-18-at-22.42.40](/api/tasks/0416/attachments/screenshot-1.png)
![Screenshot-2026-09-18-at-22.41.54](/api/tasks/0416/attachments/screenshot-2.png)

## Activity

- 2026-09-18T14:45:27Z · created · hello@repoos.org
- 2026-09-18T14:45:28Z · screenshots
- 2026-09-18T14:45:28Z · screenshots
- 2026-09-18T14:45:52Z · status draft→inbox, title, area, body
- 2026-09-18T14:56:56Z · body
- 2026-09-18T14:57:23Z · status inbox→ready
