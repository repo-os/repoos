---
id: "0465"
title: Widen integration bar popup so text wraps less
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/widen-integration-bar-popup-so-text-wrap
model_override: opencode-go/mimo-v2.5
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-20T12:50:19Z"
updated_at: "2026-09-20T12:53:19Z"
---
## Problem

The stage-explanation popup that appears above the integration status bar
(introduced in #0460) is too narrow, so its text wraps heavily — worst for the
`check` stage, whose pane renders the repo's whole check-plan listing. The pane
is currently capped at a fixed 560px, which is narrower than the bar itself in
many cases, making the popup feel cramped and hard to read.

## Desired UX

- Hovering a pipeline stage shows the popup at **at least as wide as the
  integration bar itself**, reusing the same width logic the bar already uses.
- The popup may grow **wider than the bar** where that is what's needed for
  the lines of text to avoid wrapping.
- The popup **never exceeds 80% of the window width**, regardless of content.

## Acceptance criteria

- [ ] Popup width is at least the rendered width of the integration bar,
      derived from the bar's own width logic (not a new hardcoded constant).
- [ ] The popup can be wider than the bar when necessary so lines of text
      don't need to wrap (i.e. it can size to its content).
- [ ] Popup width never exceeds 80% of the window width.
- [ ] Where "at least as wide as the bar" and "≤ 80% of window" conflict
      (narrow windows; mobile, where the bar spans nearly full width), the
      80% cap wins.
- [ ] The popup remains anchored above the bar, centred and clamped into the
      viewport, at the new widths — including across window resize.
- [ ] Existing integration-bar behavior is unaffected: stage hover/focus,
      click-to-open-task-drawer, collapse/expand, auto-collapse.
- [ ] No console errors; `repoos check` passes.

## Notes for AI

- The popup is the teleported stage hover pane (#0460): markup in
  `src/ui-app/src/components/IntegrationStatusBar.vue` (`.stage-pane`,
  teleported to `<body>`), CSS in `src/ui-app/src/style.css` (~line 8826),
  width computed in JS by `positionPane()` — currently
  `Math.min(window.innerWidth - 28, 560)`.
- The bar's own width logic lives in the same component's scoped styles:
  desktop `.ibar`/`.ibar-strip` are `width: fit-content` with
  `max-width: min(680px, calc(100vw - 28px))`. `positionPane()` already
  measures the bar via `barEl.getBoundingClientRect()`, so the bar's rendered
  width is available at exactly the point the pane is sized — prefer deriving
  the minimum from that measurement (or the same formula) over duplicating a
  new constant.
- A shape that satisfies all three constraints: preferred `width: max-content`
  (so text doesn't wrap), `min-width` = the bar's rendered width, and
  `max-width` = `min(80vw, …)`. Any equivalent implementation is fine as long
  as the acceptance criteria hold.
- The `check` stage pane has the longest content (multi-line `checkTooltip`
  built from `repoos.toml`) — use it as the sizing test case; short fixed
  stage panes (sync/merge/build/done) should end up roughly bar-width.
- Assumption: "the new popup on the integration bar" means the stage hover
  pane only; no other integration-bar surface (error box, queue row) changes.
- Keep the pane Teleported to `<body>` per repo convention for fixed
  overlays — only its sizing/positioning math should change.
- `src/ui-app/tests/integration-status-bar.test.ts` may assert the current
  560px width — update/extend rather than weaken it. Rebuild the UI
  (`bun run build:ui`) after the change so the worktree build is fresh.

## Scope

Covers the stage hover pane's width/sizing only. Deferred: popup content or
visual styling beyond width, the bar's own layout, and any other tooltips or
popovers in the app.

## Related

- #0460 — introduced the stage hover popup this task widens
- #0458 — check-plan tooltips feeding the pane's longest content

## Original prompt

Let's make this new popup on the integration bar wider so the text doesn't need to wrap so much, it should be at least as wide as the integration bar (so you can use the same logic of the integration bar width, but it could even be wider if necessary so the lines of text don't need to wrap, but not more than 80% of the width of the window.

## Screenshots

![Screenshot-2026-09-20-at-19.27.06](/api/tasks/0465/attachments/screenshot-1.png)

## Activity

- 2026-09-20T12:50:19Z · created · hello@repoos.org
- 2026-09-20T12:50:20Z · screenshots
- 2026-09-20T12:51:40Z · status draft→inbox, title, area, body
- 2026-09-20T12:52:55Z · status inbox→ready
- 2026-09-20T12:53:01Z · model_override
- 2026-09-20T12:53:04Z · review_model_override
- 2026-09-20T12:53:19Z · status ready→active, branch
