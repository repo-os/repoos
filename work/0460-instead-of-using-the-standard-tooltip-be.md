---
id: "0460"
title: Replace pipeline stage tooltips with a styled on-hover pane
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-20T00:56:47Z"
updated_at: "2026-09-20T01:53:15Z"
---
## Problem

The integration pipeline bar's stage explanations (`sync`, `merge`, `build`, `check`, `done`) are implemented as native browser tooltips via `title` attributes on the stage buttons (`IntegrationStatusBar.vue`, `stageTitle()` / `STAGE_INFO` / `checkTooltip`). Native tooltips are plain-text only — the multi-line `check` plan tooltip (one line per check step, built from `repoos.toml`) renders as an unstyled OS tooltip with inconsistent timing and no control over placement or appearance, which clashes with the rest of the app's UI.

## Desired UX

Hovering a stage in the integration pipeline bar pops up a proper hover pane positioned right above the pipeline bar, showing the same explanatory content the tooltips carry today (stage description; for `check`, the resolved plan steps). The pane is styled to match the rest of the app — themed surfaces, borders, typography, and dark/light-mode support consistent with other RepoOS popovers/panels — and disappears when the pointer leaves the stage.

## Acceptance criteria

- [ ] Hovering a pipeline stage shows an on-hover pane above the pipeline bar instead of a native `title` tooltip.
- [ ] The pane content is unchanged in substance: stage descriptions for `sync`/`merge`/`build`/`done`, and the plan-driven check tooltip (steps, commands, timeouts, dependencies) for `check`.
- [ ] The pane is anchored directly above the integration pipeline bar.
- [ ] Styling matches the app theme (both light and dark mode), consistent with existing panels/popovers.
- [ ] No native `title` tooltip appears on the stage buttons (the tooltip text must not double up with the pane).
- [ ] Hover intent feels reasonable: pane appears on hover, dismisses when the pointer leaves the stage/pane, and does not flicker when moving between adjacent stages.
- [ ] The pane does not block clicks on the pipeline stages themselves.
- [ ] Existing tests that assert tooltip rendering (`check-plan-info.test.ts`, `integration-status-bar.test.ts`) are updated and pass.

## Notes for AI

- Primary file: `src/ui-app/src/components/IntegrationStatusBar.vue` (stage buttons around the `:title="stageTitle(s)"` binding, ~line 311).
- The repo has a hard rule: any `position: fixed`/fullscreen overlay MUST be wrapped in `<Teleport to="body">` (or equivalent portal) — the pipeline bar lives in a stacking context where a plain fixed element would be trapped/unscrollable. Follow this when implementing the pane.
- Keep `stageTitle()`/`STAGE_INFO`/`checkTooltip` content as the single source of the pane's text; don't duplicate the copy.
- `aria-label` currently composes `stageTitle(s)`; preserve accessible naming (e.g. keep aria-labels or move them onto the pane with appropriate `role`/`aria-describedby`).
- Dialog/modal CSS lives in `src/ui-app/src/style.css`, not the view's `<style scoped>` block, if the pane is teleported.
- Assumption: "proper on-hover pane" means a styled hover popover; keyboard interaction (focus-visible showing the pane) is nice-to-have, not required.
- Assumption: only the stage tooltips in the expanded bar are in scope; the collapsed strip's summary `title` and other bar tooltips (collapse toggle, elapsed) are untouched unless trivially consistent to include.
- After any UI change, rebuild with `bun run build:ui` (or `bun run build`).
- Do not add runtime dependencies; zero-dependency constraint applies.

## Scope

Covers: stage hover panes in the expanded integration pipeline bar, their positioning and theming, and updating the affected tests.
Deferred: hover panes for tooltips elsewhere in the app (TaskCard, TopBar, etc.), click-to-pin behavior, animation polish beyond a simple fade if cheap.

## Related

- `#0458` — introduced the stage tooltips and the plan-driven check tooltip this task replaces.

## Original prompt

Instead of using the standard tooltip behaviour here let's make it a proper on-hover pane that pops up right above the integration pipeline bar, with styling that matches the rest of the app/theme

## Screenshots

![Screenshot-2026-09-20-at-08.48.30](/api/tasks/0460/attachments/screenshot-1.png)

## Activity

- 2026-09-20T00:56:47Z · created · hello@repoos.org
- 2026-09-20T00:56:48Z · screenshots
- 2026-09-20T00:57:29Z · status draft→inbox, title, area, body
- 2026-09-20T01:53:15Z · status inbox→ready
