---
id: "0569"
title: Make task title click-to-edit in place with autosave
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
pm_model_override: opencode/muse-spark-1.3-contributor-free
created_at: "2026-09-28T05:28:58Z"
updated_at: "2026-09-28T05:29:56Z"
---
## Problem
The task title is currently shown twice in the task view, which is redundant and visually noisy.

## Desired UX
Keep only the top title instance. Clicking on that title turns it into an editable field directly in place. Edits autosave, matching the behavior of Notion page titles where clicking the title reveals a text cursor and lets the user type.

## Acceptance criteria
- [ ] Only one task title is displayed (the top one); the duplicate title is removed
- [ ] Clicking the title makes it editable in place without navigating to a separate edit form
- [ ] Edits to the title autosave
- [ ] The title shows an affordance that it is clickable/editable (e.g. text cursor on hover/click, per the Notion reference)

## Notes for AI
- Assumption: "top one" means the header/page-level title, not the secondary copy in the body or metadata area; remove the secondary copy.
- Assumption: in-place editing means the title element itself becomes a text input on click, and blur or Enter commits the save while Esc cancels; state this behavior in the implementation if the codebase uses a different commit convention.
- Reuse the existing title-save/update path; do not introduce a new title storage mechanism.
- Do not change editing behavior for any other task fields.

## Scope
- Covers: removing the duplicate title display and adding click-to-edit with autosave on the remaining title.
- Deferred: any broader inline-editing of other task fields.

## Original prompt

Rather than showing the task title twice, let's just keep the top one and if a user clicks on it it will become editable. Ideally it is editable in place and auto-saves any edits (e.g. notion page titles behave like this - notice the cursor when I clicked on the title in the notion screenshot).

## Screenshots

![Screenshot-2026-09-28-at-13.23.16](/api/tasks/0569/attachments/screenshot-1.png)
![Screenshot-2026-09-28-at-13.28.26](/api/tasks/0569/attachments/screenshot-2.png)

## Activity

- 2026-09-28T05:28:58Z · created · hello@repoos.org
- 2026-09-28T05:29:02Z · screenshots
- 2026-09-28T05:29:03Z · screenshots
- 2026-09-28T05:29:21Z · status draft→inbox, title, area, body
- 2026-09-28T05:29:56Z · status inbox→ready
