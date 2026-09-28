---
id: "0575"
title: Prevent clicks from passing through modals and popups
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-28T13:15:47Z"
updated_at: "2026-09-28T13:16:27Z"
---
## Problem

Popups, modals, and similar layered UI in the web app are letting pointer events reach elements underneath. A single click on a control inside the overlay can fire that control’s action **and** trigger whatever sits behind it.

Concrete examples from the report:

- Clicking a button inside a popup/modal also registers as a click on the opaque backdrop, which dismisses the open side panel.
- Clicking a button that visually sits over the task drawer’s title starts inline title editing on the drawer, while the button’s own action may also run.

That is incorrect: the topmost interactive layer should consume the click. Letting events fall through causes accidental dismissals, edits, and other unintended actions and makes overlays feel broken.

## Desired UX

- While any modal, popup, confirm dialog, or equivalent floating layer is open, clicks and taps on that layer (including its buttons, inputs, and non-dismiss chrome) affect **only** that layer.
- Underlying UI — side panels, board cards, inline editors, scrims for *other* layers — does not receive the same pointer event when the user interacted with the overlay content.
- Dismissal behavior that is intentional (e.g. clicking an explicit close control or, where designed, the dimmed scrim **outside** the panel content) continues to work; the fix is about **click-through**, not removing legitimate dismiss gestures.

## Acceptance criteria

- [ ] With the task side panel open, opening a body-teleported modal/popup from that context and clicking a primary or secondary button in the modal does **not** close the side panel unless the modal’s own flow dismisses it.
- [ ] With the task side panel open and a modal positioned over the task title, clicking a button in the modal does **not** enter title-edit mode on the drawer.
- [ ] The same no–click-through behavior holds for other reported popup/modal patterns (confirm dialogs, assignment modals, nested overlays, etc.) — verified by exercising controls on the overlay, not only one screen.
- [ ] Clicks on intentional dismiss targets (modal cancel/close, scrim where that pattern already exists) still behave as today.
- [ ] No new regressions in keyboard focus trap or overlay stacking for drawers and dialogs.
- [ ] `repoos check` passes.

## Notes for AI

- Treat as a **systemic** UI event-handling / stacking / `pointer-events` issue, not a one-off button fix. Audit shared primitives first (`src/ui-app/src/components/ui/dialog/*`, `DialogOverlay`, body-teleported content per `AGENTS.md`), then confirm dialogs under `src/ui-app/src/components/*Dialog.vue`, drawer-hosted modals (e.g. `TaskDrawer.vue` — there is existing commentary about body-teleported modals dismissing the drawer), and other floating layers (search overlay, agent panels, menus/popovers if they exhibit the same symptom).
- Prefer fixing the shared overlay/content wrapper so all consumers inherit correct behavior; add local `@click.stop` / pointer handling only where a bespoke layer cannot use the shared shell.
- Task **0575** has a screenshot illustrating the failure; use it as the visual reference for the reported case.
- **Assumption:** The bug is duplicate delivery of the same physical click to both the overlay and the page below (propagation, hit-testing, or z-index), not a request to disable scrim-click-to-dismiss when the user deliberately clicks the dimmed area outside panel content.
- Do not change unrelated drawer sizing/scrim policy (see task **0544**); scope is event isolation for modals/popups.
- After UI changes, run `bun run build:ui` (or full build) so the gate sees fresh assets.

## Scope

- **In scope:** All modals, popups, and similar overlays in the web UI where clicks on overlay content incorrectly activate UI behind them; root-cause fix plus spot-check of major entry points (task drawer + confirm/assignment modals, new-task/new-input panels, settings, board cards).
- **Out of scope:** Redesigning which surfaces use a scrim, new modal UX, or native/macOS hub clients unless the same bug is reproduced there (this report is about the web overlays described above).

## Related

- **0575** — source report and screenshot
- **0544** — side panel scrim/dismiss conventions (context only; do not conflate with click-through on modal content)

## Original prompt

All of these popups and modals seem to have the same issue: clicks on them go past them and onto whatever is behind them triggering further actions, e.g. in this case if I click on the button it will trigger the button and also click on the opaque background thereby closing the currently open side panel, or if I click on the button over the side panel task title it will start editing the title. This is clearly a bug, the clicks should not propagate past the popup/modal, please check all popups and modals and things of this nature and make sure the clicks are not propagating past the thing.

## Screenshots

![Screenshot-2026-09-28-at-21.09.35](/api/tasks/0575/attachments/screenshot-1.png)

## Activity

- 2026-09-28T13:15:47Z · created · hello@repoos.org
- 2026-09-28T13:15:48Z · screenshots
- 2026-09-28T13:16:27Z · status draft→inbox, title, area, type, body
