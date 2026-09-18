---
id: "0425"
title: Style preview target dropdown consistently and add dropdown standard to AGENTS.md
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-18T17:44:12Z"
updated_at: "2026-09-18T17:44:30Z"
---
## Problem

The new preview target dropdown uses browser default styling while the status dropdown uses a custom modern style. This inconsistency in UI polish has been a recurring feedback point, coming up multiple times in reviews.

## Desired UX

The preview target dropdown matches the visual style of the status dropdown. Going forward, all dropdowns in the app use the same modern, custom styling — no default unstyled `<select>` elements.

## Acceptance criteria

- [ ] Preview target dropdown is visually styled to match the status dropdown
- [ ] Add explicit instruction to AGENTS.md Conventions section requiring use of the modern dropdown component for all new dropdowns
- [ ] Instruction notes that default unstyled `<select>` elements should never be used in the UI

## Notes for AI

- The status dropdown in the task list is the visual reference — find its component definition and reuse its style for the preview target dropdown
- This is likely a custom Vue component or CSS pattern wrapping a native `<select>`; identify it first
- The AGENTS.md instruction should be brief and go in the Conventions section, e.g.: "All dropdowns use the custom styled dropdown component. Never use unstyled `<select>` elements in the UI."
- Scope is the preview target dropdown + the AGENTS.md rule. Do not attempt a full app audit in this task — if other unstyled selects exist, file that as a separate chore task

## Scope

Covers styling the preview target dropdown to match the status dropdown style and documenting the pattern in AGENTS.md. Does not include an exhaustive audit and replacement of all other select elements in the codebase.

## Original prompt

Make the new preview target dropdown in the same style as the status dropdown. and in general always use this more modern style dropdown, don't use the default boring un-styled dropdown anywhere in the app (add that instruction to AGENTS.md please, I've had to request fixes for this a few times already.

## Screenshots

![Screenshot-2026-09-19-at-01.01.04](/api/tasks/0425/attachments/screenshot-1.png)
![Screenshot-2026-09-19-at-01.42.34](/api/tasks/0425/attachments/screenshot-2.png)

## Activity

- 2026-09-18T17:44:12Z · created · hello@repoos.org
- 2026-09-18T17:44:13Z · screenshots
- 2026-09-18T17:44:13Z · screenshots
- 2026-09-18T17:44:30Z · status draft→inbox, title, area, body
