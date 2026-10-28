---
id: "0975"
title: "Held tasks in the UI: card chip, panel held card with release, Hold button"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/held-tasks-in-the-ui-card-chip-panel-hel
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-28T12:02:51Z"
updated_at: "2026-10-28T18:26:52Z"
---
## Problem
#0960 added a durable "hold" (`repoos hold` / `unhold`, `POST /api/tasks/:id/hold` and `/unhold`) and a **Held (N)** list in the Work page footer. In the UI it is hard to tell a task is held, and a human cannot place or lift a hold from the task panel:
- Board cards and the task panel give no clear held signal. #0899 (done) and others appear in Held (9), but nothing on their cards or panel says so (screenshots). `TaskCard.vue` has a "Held" badge (`tc-held`, around line 1129) behind `isHoldActive`; find out why it is not visible on these cards and fix that, rather than adding a second badge.
- The task panel has no held card and no way to release the hold.
- There is no Hold button for a human to place one.

## Desired UX
- **Card chip:** a held task shows a "Held" chip in the same style and position as the "Human" chip, with a clock (or pause-clock) icon, in a warm warning color (orange/red, from the theme tokens) clearly different from the Human chip's color. With `hold_until`, the chip reads "Held · until <short date>". It shows on every column, done included, and works in all themes.
- **Task panel held card:** above the tabs (where the status card sits), a held task shows a compact card: "Held — automation won't start this task", the reason, who placed it and when, and the auto-release time if any. It has a **Release hold** button (calls `/unhold`) and, for an active/ready task, an optional **Release and start** (`/unhold` with start). The card disappears once released.
- **Hold button:** at the bottom of the task panel, next to Delete and Archive, a **Hold** button opens the shared dialog (not native prompt) to enter a reason (required, as the API requires) and an optional auto-release date, then calls `/hold`. For an already held task the button reads **Release hold**.
- The Held list in the footer, the card chip and the panel stay in sync live (SSE), with no reload.

## Acceptance criteria
- Held chip renders on held cards in every column, with icon, distinct color, accessible label, and the `until` variant; it never renders on an unheld task.
- Held card above the tabs with reason/by/at/until and a working Release hold button.
- Hold button next to Delete/Archive; reason required; optional until date; uses `ui/dialog/*`; calls the existing API. No new API routes unless one is missing (keep CLI/API parity).
- Tests: chip shown/hidden by `isHoldActive` (flag, tag, expired `hold_until`); panel card release calls `/unhold`; Hold dialog requires a reason and calls `/hold`.
- Declare `## Shots`: a board with a held card, the panel of a held task (held card visible), and the Hold dialog open.

## Notes for AI
`src/ui-app/src/components/TaskCard.vue` (`held`, `tc-held`), `TaskDrawer.vue` (status card above tabs; the footer Delete/Archive buttons), `src/core/task-selection.ts` (`isHoldActive`), `src/commands/control-api.ts` (`hold`/`unhold` request shapes), `src/server/routes/tasks.ts` (hold/unhold actions). Use theme tokens (the `hardcoded-colors` guard) and the shared dialog components. The Human chip is the reference for size and placement.

## Screenshots

![9](/api/tasks/0975/attachments/att_d465e9d9-cb2e-4222-b6e1-c65f712d63e6.png)
![10](/api/tasks/0975/attachments/att_cfec67c4-0e0d-4063-bf39-1ff712c7e973.png)

## Shots
```json
[
{
"label": "Board card with held chip",
"target": "default",
"route": "/work",
"highlight": ".tc-held",
"state": "board:cardChips"
},
{
"label": "Held task panel with release controls",
"target": "default",
"route": "/work?task=0899",
"highlight": ".held-panel",
"state": "drawer:held"
},
{
"label": "Hold task dialog",
"target": "default",
"route": "/work?task=0899",
"highlight": "[role=dialog]",
"steps": [
{
"click": "button[data-test-id=\"hold-task\"]"
}
],
"state": "drawer:statusDetails"
}
]
```

## Activity

- 2026-10-28T12:02:51Z · created · njachowski@gmail.com
- 2026-10-28T12:02:56Z · screenshots
- 2026-10-28T16:44:57Z · cli_override, model_override
- 2026-10-28T16:45:30Z · status inbox→ready
- 2026-10-28T16:46:16Z · status ready→active, branch
- 2026-10-28T16:48:43Z · body
- 2026-10-28T16:49:11Z · message_queued at 2026-10-28T16:49:11.196Z
- 2026-10-28T16:49:13Z · body
- 2026-10-28T17:09:07Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0956 check (pid 47788, alive), #0968 check (pid 41069, alive) for 14m · next step: let it finish — the wait clears itself when the check starts running; investigate only if it persists
- 2026-10-28T17:28:41Z · watchdog: check wait ended — cleared needs_input
- 2026-10-28T18:26:52Z · message_overdue: still queued after 60m without being delivered
