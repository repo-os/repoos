---
id: "0545"
title: Align integration panel expand and minimise buttons to the right
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/align-integration-panel-expand-and-minim
created_at: "2026-09-27T10:11:24Z"
updated_at: "2026-09-27T10:11:52Z"
---
## Problem

The expand and minimise controls in the integration UI are not placed
consistently: the expand button and the minimise button sit on opposite
sides of the panel. Users scanning the panel for these actions have to look
in two different places, which reads as a bug even though both controls
work.

## Desired UX

Both the expand and the minimise control live in the same place, on the
**right-hand side** of the integration panel header (or the right-hand side
of the panel itself, wherever each control currently lives). Toggling the
panel moves only the visible control — the same slot is reused in both
states, so the action stays anchored instead of jumping across the panel.

## Acceptance criteria

- [ ] The expand control and the minimise control are both positioned on
      the right-hand side of the integration UI, in the same slot.
- [ ] Toggling expand/minimise does not change the horizontal position of
      the control — it stays on the right.
- [ ] Collapsed and expanded states each keep their current label, icon
      and click behaviour; only the placement changes.
- [ ] The right-hand alignment holds in every width the integration panel
      supports (no regression to narrow/compact layouts).
- [ ] The panel still renders and toggles correctly with a keyboard, and
      any aria labels / titles on the buttons are unchanged.
- [ ] `repoos check` passes (build, format/lint, tests, UI smoke test).

## Notes for AI

- This is a placement/consistency change, not a redesign. Do not restyle
  the buttons, change their icons, or refactor the panel's layout
  structure beyond what moving the control requires.
- Find both controls in the integration panel component and put them behind
  one consistent right-aligned position. If they live in separate
  elements, align both to the same side rather than moving one of them
  into the other's subtree.
- Assumption (flag if wrong): "right side" means the right-hand edge of the
  panel header, matching where the panel's existing right-aligned header
  content sits. If the panel has no header, use the panel's top-right
  corner.
- Assumption: the user described a placement inconsistency only. Do not
  read it as a request to add, remove or rename any control.
- If the same expand/minimise pattern appears in sibling panels, leave them
  alone unless they are the very same component — consistency elsewhere is
  a separate task.

## Scope

Covers: placement of the integration panel's expand and minimise controls.
Deferred: any visual redesign of the integration panel, behaviour changes,
and aligning other panels' controls.

## Original prompt

The expand and minimise buttons are on different sides of the integration ui. I prefer it on the right side, please make it consistent.

## Screenshots

![Screenshot-2026-09-27-at-18.10.25](/api/tasks/0545/attachments/screenshot-1.png)
![Screenshot-2026-09-27-at-18.10.09](/api/tasks/0545/attachments/screenshot-2.png)

## Activity

- 2026-09-27T10:11:24Z · created · hello@repoos.org
- 2026-09-27T10:11:25Z · screenshots
- 2026-09-27T10:11:25Z · screenshots
- 2026-09-27T10:11:35Z · status draft→inbox, title, area, type, body
- 2026-09-27T10:11:45Z · status inbox→ready
- 2026-09-27T10:11:52Z · status ready→active, branch
