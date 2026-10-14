---
id: "0777"
title: Add a collapse/expand control to Last output
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-a-collapse-expand-control-to-last-ou
model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-10-14T07:13:06Z"
updated_at: "2026-10-14T08:26:33Z"
---
## Problem

The “Last output” section has no control to collapse or expand its contents, making it harder to manage the space it occupies.

## Desired UX

Add a button on the right side of the “Last output” section, next to the line count, that lets users collapse and expand the section.

## Acceptance criteria

- [ ] A collapse/expand button appears to the right of the line count in the “Last output” section.
- [ ] Activating the button collapses the section’s output.
- [ ] Activating the button again expands the output.

## Notes for AI

- Keep the control beside the line count in the section’s right-side area.
- Use the existing UI patterns for buttons and section state.
- Assume the button toggles the output’s visibility; no persistence behavior is implied.

## Scope

This task covers the collapse/expand control and output visibility toggle.

## Original prompt

Add a collapse/expand button on the "Last output" section (on the right side, to the right of "29 lines" in this screenshot.

## Screenshots

![Screenshot-2026-10-14-at-14.10.46](/api/tasks/0777/attachments/screenshot-1.png)

## Activity

- 2026-10-14T07:13:06Z · created · hello@repoos.org
- 2026-10-14T07:13:07Z · screenshots
- 2026-10-14T07:13:23Z · status draft→inbox, title, area, body
- 2026-10-14T08:26:29Z · model_override
- 2026-10-14T08:26:30Z · status inbox→ready
- 2026-10-14T08:26:33Z · status ready→active, branch
