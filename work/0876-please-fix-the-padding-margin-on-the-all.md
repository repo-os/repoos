---
id: "0876"
title: Fix padding and margin on allowlist pause modal
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-padding-and-margin-on-allowlist-paus
cli_override: cursor
model_override: composer-2.5
pm_cli_override: cursor
pm_model_override: composer-2.5
created_at: "2026-10-20T13:45:00Z"
updated_at: "2026-10-21T02:48:02Z"
review_rounds: 1
review_passes: 1
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T02:03:50.463Z\",\"kind\":\"dev-error\"}]"
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

## Shots
```json
[
{
"label": "Pause dialog, light theme — padded fields and action row",
"target": "default",
"route": "/agents?tab=budget-controls",
"highlight": "[data-testid=budget-pause-dialog]",
"steps": [
{
"click": "[data-testid=\"budget-row-li-claude code\"] [data-testid=\"budget-pause-agent\"]"
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
"highlight": "[data-testid=budget-pause-dialog]",
"steps": [
{
"click": "[data-testid=\"budget-row-li-claude code\"] [data-testid=\"budget-pause-agent\"]"
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

## Screenshots

![Screenshot-2026-10-20-at-19.23.43](/api/tasks/0876/attachments/att_f1edaa4b-9022-4891-8685-d79f1b68b283.png)

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
- 2026-10-21T01:15:23Z · note: review pass 1: needs some work
- 2026-10-21T01:15:24Z · status review→active
- 2026-10-21T01:20:46Z · body
- 2026-10-21T01:26:19Z · body
- 2026-10-21T01:33:53Z · body
- 2026-10-21T01:51:06Z · body
- 2026-10-21T01:52:27Z · body
- 2026-10-21T02:03:50Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T02:03:50Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T02:16:13Z · body
- 2026-10-21T02:18:41Z · body
- 2026-10-21T02:24:29Z · needs_input
- 2026-10-21T02:27:55Z · status active→ready
- 2026-10-21T02:27:55Z · engineer stopped by request
- 2026-10-21T02:28:04Z · status ready→active
- 2026-10-21T02:29:37Z · engineer stopped by request
- 2026-10-21T02:29:38Z · needs_input
- 2026-10-21T02:29:39Z · cli_override, model_override
- 2026-10-21T02:29:54Z · status active→ready
- 2026-10-21T02:30:07Z · status ready→active
- 2026-10-21T02:33:41Z · body
- 2026-10-21T02:35:26Z · body
- 2026-10-21T02:38:28Z · body
- 2026-10-21T02:41:56Z · body
- 2026-10-21T02:48:02Z · body
