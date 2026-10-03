---
id: "0638"
title: Fix unresponsive text entry fields in web UI
type: bug
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-03T10:29:31Z"
updated_at: "2026-10-03T10:29:47Z"
---
## Problem
Two text entry fields in the web UI are completely non-functional. Clicking them produces no cursor, no focus state, and typing does nothing. This blocks any input through these fields.

## Desired UX
Clicking either field shows a visible cursor and focus ring; typing inserts text normally; the fields behave like standard interactive text inputs.

## Acceptance criteria
- [ ] Identify the two broken text entry fields
- [ ] Clicking each field activates focus and shows a cursor
- [ ] Typing into each field inserts text correctly
- [ ] No console errors when interacting with the fields

## Notes for AI
Assumption: "two text entry fields" refers to input/textarea elements in the web UI (`src/ui-app`); exact selectors and page unknown from the brief description — locate them by inspecting for uninteractive or disabled-looking text fields. Do not change unrelated fields. If the root cause is a CSS `pointer-events`, missing event binding, or disabled attribute, fix only what's blocking interaction. Do not invent new fields or redesign layouts.

## Scope
Covers restoring interactivity to the two mentioned text fields only. Defers broader form validation or accessibility audits unless directly related.

## Related
None provided.

## Original prompt

These two text entry fields don't work, when I click on them nothing happens, there's no cursor and I can't type anything.

## Screenshots

![Screenshot-2026-10-03-at-18.28.12](/api/tasks/0638/attachments/screenshot-1.png)
![Screenshot-2026-10-03-at-18.26.44](/api/tasks/0638/attachments/screenshot-2.png)

## Activity

- 2026-10-03T10:29:31Z · created · hello@repoos.org
- 2026-10-03T10:29:33Z · screenshots
- 2026-10-03T10:29:33Z · screenshots
- 2026-10-03T10:29:47Z · status draft→inbox, title, priority, area, type, body
