---
id: "0423"
title: Remove redundant status display from task panel header
type: chore
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/remove-redundant-status-display-from-tas
created_at: "2026-09-18T16:55:22Z"
updated_at: "2026-09-18T18:36:53Z"
---
## Problem

The task panel displays the status in two locations: as a label on the top line and in a dropdown selector directly below the title. This duplication wastes horizontal space and makes the top line cramped. Since the status is already visible and accessible in the dropdown, the top-line label is redundant.

## Desired UX

Remove the status label from the top line of the task panel to reduce visual clutter and cramping, while keeping the status fully accessible via the dropdown below the title. The panel should have more breathing room in its header area.

## Acceptance criteria

- [ ] Status label removed from the top line of the task panel
- [ ] Status dropdown below the title remains fully functional
- [ ] Verify the inputs panel does not have a similar duplicate status display
- [ ] No console errors or visual regressions in the browser
- [ ] Task panel header appears noticeably less cramped

## Notes for AI

- The UI is in `src/ui-app/src/views/`. The task panel is likely in a component related to task display or drawer rendering.
- Check both the task panel (main view) and the inputs panel to ensure neither has duplicate status labels.
- This is purely a visual/layout change with no functional impact — status selection and display via the dropdown should be unaffected.
- Test in a browser to visually confirm the cramping is resolved.

## Scope

Removing duplicate status display from the UI only. Changes to status functionality, the dropdown itself, or other panel elements are out of scope.

## Original prompt

The status at the top line of the task panel is not necessary because it's shown in the dropdown right below the title. Let's remove it since it's a duplicate and causing the top line to be cramped anyway. Also please double check on the inputs panel that the status is not duplicated there as well.

## Screenshots

![Screenshot-2026-09-19-at-00.53.35](/api/tasks/0423/attachments/screenshot-1.png)

## Activity

- 2026-09-18T16:55:22Z · created · hello@repoos.org
- 2026-09-18T16:55:23Z · screenshots
- 2026-09-18T16:55:35Z · status draft→inbox, title, area, type, body
- 2026-09-18T17:20:00Z · status inbox→ready
- 2026-09-18T17:20:10Z · status ready→active, branch
- 2026-09-18T17:21:44Z · status active→review
- 2026-09-18T18:36:53Z · status review→done, release:success
