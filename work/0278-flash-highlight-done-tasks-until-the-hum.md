---
id: "0278"
title: Flash/highlight done tasks until the human acknowledges them
type: feature
status: done
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: feat/flash-highlight-done-tasks-until-the-hum
created_at: "2026-08-24T15:57:54Z"
updated_at: "2026-08-24T19:34:51Z"
---
## Problem

When a task successfully moves to done, there's no strong visual signal. The only feedback today is the brief, uniform `flash` (~1.2s) and `transition-success` shimmer (~0.8s) that fire on **every** task update and transition (repo.ts `flash()` / `startTransition()`, TaskCard.vue `flash`/`transition-success` classes, style.css `@keyframes flash`). It doesn't single out "this task is now done," and it's gone in a couple of seconds — the human can easily miss that a task finished successfully, especially with several tasks in flight.

The Done column already exists on the work board (COLUMNS in repo.ts; BoardColumn.vue) but auto-collapses when empty and has no per-task "acknowledged" concept, so nothing persists a highlight across reloads.

## Goal

Make a freshly-done task unmissable and make the highlight linger until the human actively acknowledges it — then it stops. The ack must survive reloads (task state is server/disk-backed; the UI stores queue state across reloads), so the highlight is not just another one-shot CSS animation.

## Fix

### Persistent "needs acknowledgement" flag (frontend state)

Add a per-task ack state to the repo store, keyed by task id, that is:
- Set to "needs ack" the moment a task transitions into `done` (in applyEvent, on a `task.updated` whose statusChanged is `review -> done` — i.e. the transition-producer already in repo.ts:523-525). Also set it for a task already in `done` at initial board load **only if its done-transition is recent enough** — otherwise every Done card in history would permanently flag. "Recent" should be a clear, configurable constant (e.g. last 24h from `updated_at` / the SS= entry) so reopening the board doesn't re-flag old tasks but does catch a done that happened while the tab was closed.
- Cleared when the human clicks an "Acknowledge" action on the task's card.
- Persisted so the flag survives a page reload. RepoOS keeps per-user UI prefs in localStorage (see `repoos.board.collapsed`, `repoos.board.sortOrder`); store the ack set the same way (e.g. `repoos.done.acked` as a set of task ids). Server-side persistence is out of scope — this is a UI concern.

No server/API change is required; the flag is client-side derived state plus localStorage.

### Visually distinct "just landed in done" treatment

On a task card whose status is `done` and whose ack flag is set:
- Render a persistent highlight that reads "this is newly done," not a generic flash — reuse/extend the existing `transition-success` or `.task-card.flash` machinery but make it a steady state (inset ring / tint in the done green) while unacked, distinct from the short shimmer.
- Add a small "Acknowledge" / dismiss button at the bottom of the card, **styled like the existing card action buttons** (TaskCard.vue `.tc-foot` / `tc-actions` footer, actionFooterClass "done" green variant) — full or near-full-width footer with the done-green tint, label like "Acknowledge". Clicking it clears the flag (and the persistent highlight) and stops nothing else; stop propagation so it doesn't open the drawer.
- The Done column currently collapses when empty (BoardColumn.vue applyDefaults). If a task lands in done, the column should expand auto-matically so the unmissable card is actually visible, not hidden behind a collapsed cap — consider auto-expanding the done column when it first receives an unacked task, and/or a notifier on the collapsed cap (count badge) so it's visible even when the column stays collapsed by preference.

### Acceptance behaviour

- Moving a task review -> done makes its card glow in the done column and shows an "Acknowledge" button.
- Clicking Acknowledge removes the persistent highlight for that card, in this tab and in any other tab already open (shared store / localStorage event), and stays off after a reload.
- Reloading the page does not re-flag done tasks acknowledged before, and does not flag very old done tasks.
- Other status update animations (the existing flash/shimmer on any task.updated) are unchanged — the persistent ack highlight is additive and only for `done`.

## Verification

- `repoos check` green (build, typecheck, tests, UI smoke test).
- Manual: create/move a task to done → card highlights + Acknowledge button appears in Done column; button clears it; reload keeps it cleared; a task already done days ago has no highlight on a fresh load.
- A component/unit test for the store: `task.updated` review->done sets the flag; ack clears it; persistence round-trips through localStorage.

## Related

- #0270 "Highlight the Move to done button when review passes" — adjacent, complements this (that one flags the button the human clicks to GET here; this one flags the done result).
- Existing action-footer + flash/shimmer code in TaskCard.vue and style.css are the natural seams.

## Activity

- 2026-08-24T16:00:19Z · body
- 2026-08-24T17:43:27Z · body
- 2026-08-24T17:57:10Z · status inbox→ready
- 2026-08-24T17:57:20Z · status ready→active, branch
- 2026-08-24T18:09:13Z · status active→review
- 2026-08-24T19:34:51Z · status review→done, release:success
