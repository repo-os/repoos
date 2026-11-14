---
id: "1116"
title: Finish touch affordances across mobile surfaces
type: feature
status: ready
priority: p1
area: web
depends_on: ["1112", "1114", "1115"]
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:11:01Z"
updated_at: "2026-11-14T16:12:46Z"
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

## Floating heads on narrow screens (added by Nick)
On screens below 720px the floating heads (Ross, CTO, Debugger) must not reserve their own column. Today `.main` in src/ui-app/src/style.css (narrow block, about line 9534) sets `padding-inline-end: max(16px, var(--page-inline-end-inset))`, which takes about 70px (head size 46 + offset 12 + 12) off an already narrow content width, and `.ibar-wrap` in IntegrationStatusBar.vue (narrow block, about line 1187) offsets `right: var(--page-inline-end-inset)` for the same reason. Required: (1) on narrow screens set the inline-end inset to 0 so content and the integration bar use the full width, and let the heads float OVER the content (they are already position: fixed at the bottom right above the tab bar); (2) keep bottom clearance so the last row is never hidden under the stack, using the existing --page-bottom-inset; (3) add a per-device preference, default OFF on narrow screens and ON on desktop, to show or hide the floating heads, as a control in Settings (shared components, no native select; stored per device in local storage, not repoos.toml); when hidden, the CTO/Ross/Debugger remain reachable from the More sheet; (4) tests for the inset on narrow and wide screens, the preference, and no horizontal overflow; (5) phone-width (viewportWidth 390) shots with heads shown and hidden.

## Activity

- 2026-11-14T09:11:01Z · created · t@t
- 2026-11-14T09:11:02Z · needs_input
- 2026-11-14T09:11:47Z · depends_on, body: Desired UX (added); Acceptance criteria (added 5, removed 5); Notes for AI (added); Desired outcome (removed)
- 2026-11-14T09:22:40Z · needs_input
- 2026-11-14T16:03:44Z · cli_override, model_override
- 2026-11-14T16:03:46Z · status inbox→ready
- 2026-11-14T16:12:46Z · body: Floating heads on narrow screens (added by Nick) (added)
