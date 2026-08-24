---
id: "0270"
title: Highlight the Move to done button when review passes
type: feature
status: active
priority: p3
area: ui
assigned_to: ai
created_by: ""
branch: feat/highlight-the-move-to-done-button-when-r
created_at: "2026-08-24T15:55:48Z"
updated_at: "2026-08-24T20:44:17Z"
---
## Problem

When an automatic review passes and a task is "good to go," the "Move to done" button looks like any other button. It's easy for the human to miss that action is needed — a task can sit in `review` waiting on a click for a long time without any visual cue that it's actually ready.

Today the only signal the task is ready is the "waiting for human" hint chip (`tc-human`, TaskCard.vue:224) on the card, which is easy to overlook when several cards are in flight. The thing the human actually needs to click — the "Move to done" button — carries no visual emphasis at all.

This is the complement to #0278 (flash done tasks until acknowledged): #0278 flags the *result* after the human clicks; this flags the *button* the human needs to click to get there.

## Fix

Visually call out the "Move to done" button once review passes clean, so it's obvious the task is ready and waiting on a human click.

### Trigger — "review passed clean"

Highlight only when the task is genuinely waiting on the human, never while work is ongoing. The trigger mirrors the existing `waiting-for-human` card class (TaskCard.vue:373 / `tc-human` hint at :224) — all of these must be true:

- `task.status === 'review'`
- not `inPipeline` (no close-out job queued/running — integration.ts `active`/`queue`)
- `repo.reviewFor(task.id)?.running` is false (automatic review finished)
- `repo.isRunning(task.id)` is false (engineer isn't coding or auto-fixing a post-handoff check failure)

So: review finished, check green, not being merged — human's turn. If the button is disabled for any of the above reasons, no highlight.

### Presentation

Make the "Move to done" button (the `review` entry of `ACTIONS`, TaskCard.vue:114-119, `variant: "done"`) unmistakable once the trigger holds:

- **Pulse/glow**: an attention-grabbing but non-nauseating pulse on the done-green button (reuse/extend the existing `transition-success` / `@keyframes flash` machinery in style.css, or add a dedicated `@keyframes`). It should read as "ready, click me," distinct from the generic one-shot `flash` that fires on every task update.
- **Steady state too, not just a one-shot animation**: because a card in `review` can sit for a while, prefer a treatment that persists while the trigger holds (a steady ring/glow or shadow), optionally combined with a slow pulse, rather than a brief animation that's already gone when the human glances at the board.
- **Label/affordance**: consider a short helper line or an attention dot on the card (alongside or replacing the `tc-human` chip) reading something like "Review passed — ready to finish", so the card itself signals "action needed" independent of the button.
- Buttons for other variants (`start`, `move`, `pause`) are unchanged.

### Acceptance behaviour

- A task in `review` whose review finished cleanly (and that isn't mid-close-out) shows the Move to done button highlighted/glowing; the card shows a "ready to finish" cue.
- While the automatic review is still running, or the engineer is still coding/fixing, the button is NOT highlighted (it's disabled as today).
- Once the human clicks Move to done (pipeline starts), the highlight clears — no longer misleading while the close-out runs.
- No flashy motion on non-review transitions; existing flash/shimmer on other status updates is untouched.

## Design notes / edge cases

- The highlight is purely presentational on the existing deterministic trigger — no new state required, it's derived from data the UI already has. No server/API change.
- Keep it additive to `TaskCard.vue` / `style.css`; don't disturb #0278's persistent done-ack highlight (different state, different moment).
- Respect reduced-motion: gate any pulsing animation behind `prefers-reduced-motion` (keep the steady highlight, drop the motion).

## Verification

- `repoos check` green (build, typecheck, tests, UI smoke test).
- Manual: a review task whose review finishes clean → button highlighted + "ready" cue; while review is running or check-retry is active → no highlight; after clicking Move to done → highlight gone.
- A component/unit test for the derived trigger: heading (status review + not running + not in pipeline) yields the highlight; each of the false branches suppresses it.

## Related

- #0278 "Flash/highlight done tasks until the human acknowledges them" — adjacent; that flags the done result, this flags the button the human clicks to get there. Coordinate so the two don't overlap or double-animate.
- #0120 "Show automatic review in progress and block move-to-done until it finishes" — the trigger's "review finished" conditions.

## Activity

- 2026-08-24T20:28:20Z · body
- 2026-08-24T20:31:33Z · status inbox→ready
- 2026-08-24T20:44:17Z · status ready→active, branch
