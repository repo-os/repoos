---
updated_at: "2026-09-20T00:13:36Z"
review_passes: 2
id: "0455"
title: "Show per-task agent assignments (PM, Engineer, Reviewer) on the task card"
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/show-per-task-agent-assignments-pm-engin
created_at: "2026-09-19T23:14:22Z"
---
## Problem

There is no quick, at-a-glance way to see which agents (PM, Engineer, Reviewer) are configured for a given task from the board. To find this you must open the task drawer and dig into the agent-override controls. For a board that's meant to give a fast overview of work, the agent assignments — a core part of "who is doing this" — are hidden.

## Desired UX

On each task card, a small robot/agent icon button sits in the **bottom-right corner**. Clicking or hovering it toggles a compact panel of the task's agent assignments, rendered as **three single-line rows** (one each for PM, Engineer, Reviewer), shown **above the card's action button** and **below the main card body** — without ever overflowing or breaking out of the card's rounded bounds.

- Each row is one line: a fixed role label (PM / Engineer / Reviewer) and the effective agent name.
- The effective name is the per-task override when set, otherwise the board default for that role.
- The panel collapses on mouse-leave (for hover) and on a second click (for click-to-toggle); both interactions must work.
- The icon is small and unobtrusive, using the existing app agent/violet color language so it reads as "agents," not a primary action.

## Acceptance criteria

- [ ] A robot/agent icon button is rendered in the bottom-right corner of every task card.
- [ ] Clicking the button toggles the agent panel open/closed.
- [ ] Hovering the button (or its region) also reveals the panel.
- [ ] The panel shows exactly three single-line rows: PM, Engineer, Reviewer, with their effective agent names.
- [ ] The panel is positioned above the action button (and below the card body), inside the card, and never overflows or clips.
- [ ] Each row shows the per-task override name when present, otherwise the default agent for that role.
- [ ] Toggling does not interfere with the card's existing click-to-open, drag, or action button.
- [ ] The new UI passes `oxfmt --check` and `oxlint`, and a rebuilt `dist/` serves without console errors (UI smoke test).

## Notes for AI

- Primary file to touch: `src/ui-app/src/components/TaskCard.vue` (the board card). Add the icon button + toggled panel in the `<template>` and the open/close state in `<script setup>`.
- Agent assignment data already lives on the `Task` object (see `src/ui-app/src/types.ts`): `agentOverride` = Engineer (`:64`), `pmAgentOverride` (`:70`), `reviewerAgentOverride` (`:75`). These are null when the role uses the board default.
- Effective default names resolve server-side in `src/server/agents.ts` (`resolveAgentForTask`, `resolveReviewerForTask`, and a PM resolver). On the card, prefer showing the override when non-null; when null, fall back to a stable role label (e.g. the configured default agent name, or the literal role name "pm"/"engineer"/"reviewer" if the store doesn't expose config defaults). Assumption: a card-level local resolver that takes the override-or-role-name is sufficient; no new API endpoint is required unless the default agent names aren't otherwise available in the UI.
- Mirror the existing design language: reuse CSS variables (e.g. `var(--violet)` for the agent color, `var(--chip-bg)` / `var(--border)` for the rows), and the `size-4` / `rounded` icon sizing already used by action buttons.
- Do **not** introduce a default unstyled `<select>`; if any picker is needed it must use the custom styled dropdown component per `AGENTS.md` conventions. (A picker is likely out of scope — this task only *displays* assignments.)
- The icon must not capture the card's `@click="ui.openTask(task)"` or break `@dragstart`; use `@click.stop` like the existing action/acknowledge buttons.

## Scope

In scope: a display-only, togglable agent summary on the card (PM / Engineer / Reviewer names). Out of scope: editing agent assignments from the card (that stays in the drawer), showing CLI/model overrides, and agent run status/telemetry — those already have indicators elsewhere on the card.

## Related

- `src/ui-app/src/components/TaskCard.vue` — card layout, action footer, ack footers.
- `src/ui-app/src/types.ts` — `agentOverride` / `pmAgentOverride` / `reviewerAgentOverride`.
- `src/server/agents.ts` — effective-agent resolution (reference only).

## Activity

- 2026-09-19T23:14:22Z · created · unknown
- 2026-09-19T23:19:44Z · status inbox→ready
- 2026-09-19T23:21:34Z · status ready→active, branch
- 2026-09-19T23:31:21Z · status active→review


