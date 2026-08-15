---
id: "0224"
title: Float the integration status bar as a compact panel on desktop
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/float-the-integration-status-bar-as-a-co
model_override: default
created_at: "2026-08-15T11:25:20Z"
updated_at: "2026-08-15T12:11:11Z"
---
## Problem

`IntegrationStatusBar.vue` renders as a full-bleed strip pinned to the bottom
of the viewport (`.ibar-wrap { position: fixed; left: 0; right: 0; bottom: 0 }`).
On desktop this spans the entire window width even though its content — a
title, a short stage list, an optional queue row — only needs a fraction of
that space. It reads as a heavy dock rather than a status indicator.

On mobile the bar has the same full-width `position: fixed; bottom: 0` rule as
the tab bar (`.tabbar` in `src/ui-app/src/style.css`, also
`position: fixed; bottom: 0`, `z-index: 50`). The status bar's `.ibar-wrap` is
`z-index: 900`, so today it stacks visually on top of the tab bar rather than
above it with a gap — at the "expanded" height (title + stage list + optional
error/queue rows) it can obscure the nav entirely.

## Desired UX

On desktop (and other wide viewports), the integration bar no longer spans the
full window width. It becomes a floating, oblong (rounded, pill/capsule-like)
panel anchored near the bottom of the screen — for example bottom-centered or
bottom-corner-anchored, sized to its content with a sensible max-width —
rather than a full-width dock. It keeps its current collapsed/expanded
behavior, stage list, queue, and retry affordance; only its width, shape, and
positioning change.

On mobile/narrow viewports, the bar can remain full width as it is today, but
it must always render above the bottom tab bar (`.tabbar`) with no overlap in
either the collapsed or expanded state — the tab bar stays fully visible and
tappable whenever the integration bar is shown.

## Acceptance criteria

- [ ] On desktop widths, the integration bar (collapsed strip and expanded
  panel) no longer stretches edge-to-edge; it renders as a floating, rounded
  oblong panel near the bottom of the viewport, sized to its content up to a
  reasonable max-width, with visible page/background around it.
- [ ] The floating panel remains legible and functional in both themes
  (`clear`, `gen z`, and the default/`classic` theme) and preserves existing
  visuals: the stage list with check/current/failed states, the queue row, the
  error banner and Retry button, and the collapse/expand toggle all still
  work.
- [ ] On mobile widths (≤760px, matching the existing `.tabbar` breakpoint),
  the bar's layout is unchanged (full width is acceptable) except that it no
  longer overlaps `.tabbar` in either collapsed or expanded state — the tab
  bar's icons/labels remain fully visible and clickable at all times.
- [ ] Collapsed-state persistence (`localStorage` key
  `repoos.integrationBar.collapsed`) and all existing interactions (expand,
  collapse, retry) continue to work unchanged on both desktop and mobile.
- [ ] No regression to `IntegrationStatusBar`'s reactive behavior (idle state,
  active task, failed state, queue count) — only layout/positioning changes.

## Notes for AI

- Primary file: `src/ui-app/src/components/IntegrationStatusBar.vue`
  (`<style scoped>` block, particularly `.ibar-wrap`, `.ibar`, and
  `.ibar-strip`).
- Mobile tab bar for reference/coordination: `.tabbar` rules in
  `src/ui-app/src/style.css` (around the `@media(max-width:760px)` block) —
  note its height varies with `env(safe-area-inset-bottom)` via
  `calc(var(--safe-bot) + 8px)` padding, so the offset/z-index fix should
  account for that rather than a fixed pixel guess.
- Use a `min-width`/breakpoint consistent with the existing mobile breakpoint
  (760px) so desktop vs. mobile treatment doesn't flicker or diverge from the
  tab bar's own breakpoint.
- Don't change `IntegrationPipelineSnapshot`/store logic in
  `src/ui-app/src/stores/repo.ts` or `src/ui-app/src/types.ts` — this is a
  pure layout/CSS task.
- Verify visually with RepoOS's own managed preview at both a desktop width
  and a narrow (≤760px) width, in at least the `clear` theme shown in the
  screenshots that prompted this task.

## Activity

- 2026-08-15T11:25:20Z · created · unknown
- 2026-08-15T11:25:50Z · model_override
- 2026-08-15T11:28:46Z · status inbox→ready
- 2026-08-15T12:00:34Z · status ready→active, branch
- 2026-08-15T12:06:10Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T12:11:11Z · status ready→active
