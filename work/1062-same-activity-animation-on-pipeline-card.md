---
id: "1062"
title: Same activity animation on Pipeline cards as Board cards; pause animations when not visible
type: chore
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-08T09:13:53Z"
updated_at: "2026-11-08T09:14:01Z"
---
## Problem
1. The card activity animation chosen in Settings (activity animation style and size, via `ActivityIndicator.vue`) shows on Board cards (`TaskCard.vue` uses it 7 times) but NOT on Pipeline cards: `PipelineCard.vue` does not use `ActivityIndicator` at all and shows only a plain status dot. The same running task looks alive on one view and static on the other, and the Settings choice is ignored in Pipeline.
2. Animations keep running when they cannot be seen. `ActivityIndicator.vue` has no visibility handling (no `visibilitychange`, no `IntersectionObserver`, no `animation-play-state` control), so animations on the non-visible view (the Board while Pipeline is shown, or the reverse), in collapsed columns, off-screen cards, hidden browser tabs, and behind drawers and dialogs still run and cost CPU and memory (compositor layers, JS timers).

## Desired behavior
1. Pipeline cards show the same Settings-selected activity animation (style and size) as Board cards wherever the Board card shows it for the same state (coding, running checks, reviewing, etc.). Use the shared `ActivityIndicator` component, not a copy. The Pipeline dot is replaced by (or wraps) it without changing the card height.
2. Animations run only while visible: paused (CSS `animation-play-state: paused`, no JS timers or rAF loops, no will-change layers) when the document is hidden, the card is outside the viewport, its column is collapsed, or its whole view is not the active one. Resume immediately when visible again. Implement once in the shared component (one shared `IntersectionObserver` plus a single `visibilitychange` listener, not one per card).
3. The non-active view (Board vs Pipeline) should not keep rendering or animating its cards: unmount it or mark it `v-show` hidden with animations paused, whichever the router/view setup allows without losing scroll state.
4. Respect `prefers-reduced-motion` and the existing Settings "off" choice.

## Acceptance criteria
- Test: Pipeline card for a running task renders `ActivityIndicator` with the configured style and size; a non-running task does not animate.
- Test: when `document.hidden` is true, or the card is not intersecting, or its column is collapsed, the indicator reports paused (computed `animation-play-state: paused` or the paused class); it resumes when visible.
- Test: only one shared observer and one `visibilitychange` listener exist regardless of card count.
- Test: the hidden view (Board while on Pipeline) has no running animations.
- Measure and report: number of running CSS animations (`document.getAnimations().length`) with 30 cards on the visible view and on the hidden view before and after, plus JS heap or layer count if available.
- Shots: Pipeline cards with each animation style; `repoos check --changed main` passes; do NOT edit `repoos.toml`.

## Notes for AI
Files: `src/ui-app/src/components/ActivityIndicator.vue`, `PipelineCard.vue`, `TaskCard.vue`, `src/ui-app/src/views/WorkView.vue` and `PipelineView.vue` (how the two views are mounted), the Settings keys for activity animation in `src/core/config.ts` and `SettingsView.vue`. Reuse the existing styled components and global classes in `style.css`; no native tooltips.

## Activity

- 2026-11-08T09:13:53Z · created · njachowski@gmail.com
- 2026-11-08T09:13:53Z · needs_input
- 2026-11-08T09:14:00Z · body
- 2026-11-08T09:14:01Z · needs_input, cli_override, model_override, review_cli_override, review_model_override
