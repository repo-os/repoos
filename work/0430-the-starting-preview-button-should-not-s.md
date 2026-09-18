---
id: "0430"
title: Remove target name from starting preview button
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/remove-target-name-from-starting-preview
created_at: "2026-09-18T19:06:04Z"
updated_at: "2026-09-18T19:10:06Z"
---
## Problem

The "starting preview" button currently displays the target name, but that information is already visible in the dropdown selection above it. This creates redundant visual noise in the UI.

## Desired UX

The preview button should display only a label like "Starting preview" without repeating the target name, since the selected target is already clearly shown in the dropdown.

## Acceptance criteria

- [ ] The "starting preview" button label no longer includes the target name
- [ ] The button remains functional and properly triggers the preview workflow
- [ ] The selected target is still clearly visible in the dropdown above the button

## Notes for AI

- This is a straightforward UI text cleanup in the preview/task drawer area
- Find where the "starting preview" button is rendered (likely in the task drawer or preview-related component)
- Remove the target name from the button label while keeping the label clear and actionable
- This is a visual-only change; no behavior should change

## Original prompt

the "starting preview" button should not show the name of the target, because it's already shown in the dropdown selection.

## Screenshots

![Screenshot-2026-09-19-at-02.12.34](/api/tasks/0430/attachments/screenshot-1.png)

## Activity

- 2026-09-18T19:06:04Z · created · hello@repoos.org
- 2026-09-18T19:06:05Z · screenshots
- 2026-09-18T19:06:18Z · status draft→inbox, title, area, body
- 2026-09-18T19:06:26Z · status inbox→ready
- 2026-09-18T19:06:35Z · status ready→active, branch
- 2026-09-18T19:10:06Z · status active→review
