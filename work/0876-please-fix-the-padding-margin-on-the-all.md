---
id: "0876"
title: Fix padding and margin on allowlist pause modal
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-padding-and-margin-on-allowlist-paus
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
pm_cli_override: cursor
pm_model_override: composer-2.5
created_at: "2026-10-20T13:45:00Z"
updated_at: "2026-10-21T01:14:25Z"
---
## Problem

The pause dialog on **Agents → Budget Controls** (opened when pausing a whole allowlist agent or a single model) has incorrect padding or margin. Content feels cramped, misaligned, or inconsistent with the rest of the app, which makes the form harder to read and looks unfinished compared with neighboring UI.

## Desired UX

Opening **Pause** on an allowlist row shows a modal whose internal spacing matches other shared `cc-modal` dialogs in RepoOS (especially the **Add to allowlist** dialog in the same panel): comfortable padding around the title, description, date/reason fields, and action buttons; consistent gaps between fields; and no content flush against the dialog edges or action row.

## Acceptance criteria

- [ ] Pause modal padding and margin are corrected so title, description, fields, and Cancel/Pause actions align and breathe like the add-allowlist modal on the same page.
- [ ] Field block spacing (resume date, reason) is visually even and uses the same form/dialog patterns as other modals (`field`, `cc-modal-*` utilities in `style.css` where appropriate).
- [ ] Layout looks correct in both light and dark theme on the Budget Controls tab.
- [ ] Pause/resume behavior and config writes are unchanged; this is a visual-only fix.
- [ ] `bun run build:ui` (or full build) is run so the shipped UI reflects the change.

## Notes for AI

- Primary surface: `src/ui-app/src/components/BudgetControlsPanel.vue` — pause dialog uses `DialogContent` with classes `cc-modal budget-pause-dialog`, `.budget-pause-fields`, and shared `cc-modal-head` / `cc-modal-desc` / `cc-modal-actions`. Compare structure and spacing to the **Add to allowlist** dialog in the same file (`budget-add-dialog`).
- Shared modal rules live in `src/ui-app/src/style.css` (`cc-modal-head`, `cc-modal-desc`, `cc-modal-actions`, global `field` helpers). Prefer extending shared classes over one-off magic numbers unless the pause dialog needs a small scoped tweak (e.g. `.budget-pause-fields`).
- **Assumption:** the reported issue is limited to the pause modal, not the whole Budget Controls table or chips (#0850).
- Do not use native `alert`/`confirm`; keep the existing Radix dialog + teleported overlay pattern (`data-overlay-layer` is handled by shared dialog components).
- Do not change allowlist pause logic (`pauseAllowlistEntry`, API/config). Existing tests in `src/ui-app/tests/budget-controls-panel.test.ts` should still pass; add or adjust a test only if you introduce a stable `data-testid` or class worth asserting — not required for pure CSS unless the repo already snapshots modal layout.
- A screenshot of the problem is attached to the PM draft for this request; use it as the visual reference for “before.”

## Scope

**In:** spacing/layout of the allowlist **pause** modal only.

**Out:** redesign of Budget Controls rows, pause chips, add-allowlist modal (unless you need to mirror its spacing verbatim), CLI `repoos agents pause`, or server-side allowlist behavior.

## Related

- #0850 — allowlist pause feature (Budget Controls UI and config)
- #0764 — Budget Controls tab / allowlist panel

## Original prompt

Please fix the padding/margin on the allowlist pause modal

## Screenshots

![Screenshot-2026-10-20-at-19.23.43](/api/tasks/0876/attachments/att_f1edaa4b-9022-4891-8685-d79f1b68b283.png)

## Shots
```json
[
{
"label": "Pause dialog, light theme — padded fields and action row",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": ".budget-pause-dialog",
"steps": [
{
"click": "[data-testid='budget-row-li-opencode'] [data-testid='budget-pause-agent']"
},
{
"waitMs": 500
}
],
"state": "budget:paused",
"theme": "light"
},
{
"label": "Pause dialog, dark theme — padded fields and action row",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": ".budget-pause-dialog",
"steps": [
{
"click": "[data-testid='budget-row-li-opencode'] [data-testid='budget-pause-agent']"
},
{
"waitMs": 500
}
],
"state": "budget:paused",
"theme": "dark"
}
]
```

## Activity

- 2026-10-20T13:45:00Z · created · hello@repoos.org
- 2026-10-20T13:45:06Z · screenshots
- 2026-10-20T13:45:38Z · status draft→inbox, title, area, type, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added); Related (added)
- 2026-10-21T00:58:01Z · status inbox→ready
- 2026-10-21T00:58:06Z · cli_override, model_override
- 2026-10-21T00:58:08Z · status ready→active, branch
- 2026-10-21T01:00:27Z · body
- 2026-10-21T01:02:05Z · body
- 2026-10-21T01:02:27Z · note: click [data-testid='budget-pause-agent']: click: Error: strict mode violation: locator('[data-testid=\'budget-pause-agent\']') resolved to 2 elements: on /agents?tab=budget-controls
- 2026-10-21T01:02:27Z · note: highlight .budget-pause-dialog matched nothing on /agents?tab=budget-controls
- 2026-10-21T01:02:34Z · note: click [data-testid='budget-pause-agent']: click: Error: strict mode violation: locator('[data-testid=\'budget-pause-agent\']') resolved to 2 elements: on /agents?tab=budget-controls
- 2026-10-21T01:02:35Z · note: highlight .budget-pause-dialog matched nothing on /agents?tab=budget-controls
- 2026-10-21T01:02:44Z · body
- 2026-10-21T01:14:24Z · status active→review
- 2026-10-21T01:14:25Z · note: shots: skipped — 4 shots already captured — an engineer-made capture pre-empts the automatic one
