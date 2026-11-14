---
id: "1116"
title: Finish touch affordances across mobile surfaces
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX, Notes for AI"
priority: p1
area: web
depends_on: ["1112", "1114", "1115"]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-14T09:11:01Z"
updated_at: "2026-11-14T09:11:47Z"
---
## Problem
Some existing surfaces still depend on hover or small pointer controls. The last-activity popover work in #1069 is complete, but its behavior needs to be included in the narrow-screen experience.

## Desired UX
Users can discover and operate important actions on touch across Work, task details, Settings, Releases and Activity.

## Acceptance criteria
- Audit affected screens below 720 px for hover-only actions, targets below 44 CSS px where practical, and horizontal overflow; fix remaining issues within scope.
- Preserve desktop interaction and avoid changing unrelated tooltip hosts globally.
- Ensure completed #1069 last-activity trigger works on touch in the mobile composition; retain scoped gesture behavior and pointercancel safety.
- Make Releases and Activity readable and actions discoverable on narrow screens, including configured and empty states.
- Add focused coverage for touch activation, pointer cancellation, overflow and action visibility.
- Follow shared overlay/dialog and keyboard accessibility conventions.
## Notes for AI
Read ADR 0011. #1069 is already complete and should not be reopened by default; verify its scoped interaction and integrate only if the new mobile compositions require adaptation. Keep this task to cross-surface touch fixes after the shell, detail and Settings slices.

## Activity

- 2026-11-14T09:11:01Z · created · t@t
- 2026-11-14T09:11:02Z · needs_input
- 2026-11-14T09:11:47Z · depends_on, body: Desired UX (added); Acceptance criteria (added 5, removed 5); Notes for AI (added); Desired outcome (removed)
