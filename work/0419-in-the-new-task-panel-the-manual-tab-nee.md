---
id: "0419"
title: Add optional body text area to manual task creation
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-optional-body-text-area-to-manual-ta
created_at: "2026-09-18T15:15:49Z"
updated_at: "2026-09-18T16:57:55Z"
---
## Problem

The manual task creation flow in the "new task" panel only allows users to enter a title. Users who want to provide an initial task body must create the task first and then edit it, adding an extra step to the workflow.

## Desired UX

In the manual tab of the new task panel, add an optional text area field where users can enter the task body at creation time. Users should be able to create a task with only a title (body remains optional), or provide both title and body in one step.

## Acceptance criteria

- [ ] Manual tab in new task panel displays a text area field for task body
- [ ] The body field is optional; tasks can be created with title only
- [ ] Title remains the only required field for task creation
- [ ] Body text entered in the field is included in the created task file
- [ ] The text area has appropriate placeholder or label text indicating the field is optional
- [ ] The UI layout remains clean and doesn't disrupt the current manual creation flow

## Notes for AI

This is a UI feature for the new task creation panel. Focus on the manual tab specifically. The body text can be any markdown content the user wishes to include. The task creation handler should pass the optional body parameter through to the task file creation logic, which already supports arbitrary markdown body sections. Assume the backend can handle an empty/undefined body parameter gracefully.

Do NOT add validation or parsing of the body content — accept whatever the user types and pass it through as-is.

## Scope

This task covers adding the text area field to the manual tab UI and wiring it to the task creation flow. It does not cover template suggestions, body validation, or markdown preview — those are separate concerns.

## Original prompt

In the "new task" panel the manual tab needs a text area field for the user to manually type the task body (optional). Only the title is required to create the manual task.

## Activity

- 2026-09-18T15:15:49Z · created · hello@repoos.org
- 2026-09-18T15:16:04Z · status draft→inbox, title, area, body
- 2026-09-18T15:16:54Z · status inbox→ready
- 2026-09-18T15:19:26Z · status ready→active, branch
- 2026-09-18T15:21:56Z · status active→review
- 2026-09-18T16:57:55Z · status review→done, release:success
