---
id: "0055"
title: Declutter task cards and add action buttons
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/declutter-task-cards-and-add-action-butt
created_at: "2026-08-06T18:01:49Z"
updated_at: "2026-08-10T22:57:52Z"
---
## Problem

The task cards in the work queue are visually busy. The branch name shown at the bottom left of each card is redundant — it is essentially the same as the card title. The "ai" pill is also unnecessary noise, since every task in this workflow is assigned to the AI. This clutter crowds the cards and squeezes the action buttons, which currently cannot be as large and tappable as they should be.

## Desired UX

- Task cards show only the information that matters: title, status, and a clear action.
- The branch name is removed from the bottom left of each card.
- The "ai" pill is removed.
- The freed-up space is used to make the action button(s) on each card larger and easier to click.
- Every task in the work queue has an action button — in most columns, each task should have an action button. The exception is the `done` column, where tasks show no action button.

## Acceptance criteria

- [ ] Branch name no longer renders on task cards
- [ ] "ai" pill no longer renders on task cards
- [ ] Action buttons on task cards are visibly larger than current size
- [ ] Every task in the work queue (all columns) has an action button except tasks in `done`
- [ ] `done` column tasks show no action button
- [ ] `repoos check` passes

## Notes for AI

- This is a UI-only change; do not touch the task engine (`src/core`) or the CLI.
- The task cards are rendered by the single-file web UI under `src/ui`.
- After the change, rebuild (`bun run build:ui` for speed, or `bun run build`) and keep `repoos serve` running so the change can be viewed, then verify with a browser probe before reporting done.
- Assumption: "most columns" means every work-queue column except `done` gets an action button for each task; the exact action per column should match whatever action each column's tasks currently expose.

## Scope

- Covers: removing branch name, removing "ai" pill, enlarging action buttons, adding action buttons per task in every column except `done`.
- Deferred: any other card content/format changes beyond the above.

## Activity

- 2026-08-06T18:01:49Z · created · unknown
- 2026-08-06T18:02:10Z · status inbox→ready
- 2026-08-06T18:02:12Z · status ready→active, branch
- 2026-08-10T22:57:52Z · status active→ready
