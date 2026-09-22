---
id: "0485"
title: Fix Stories page spacing and styling to match other pages
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-stories-page-spacing-and-styling-to-
created_at: "2026-09-22T15:52:13Z"
updated_at: "2026-09-22T18:08:09Z"
---
## Problem

The Stories page (#0480) was built with its own hand-rolled layout: scoped `stories-page` / `stories-header` / `stories-title` / `stories-sub` classes with bespoke padding (`22px 26px 60px`), its own max-width, and custom title/description typography. Every other main page uses the app's shared page-header conventions (`page-header`, `page-title`, `page-desc` — see Work, Inputs, Settings, Agents, Repo Context). The result is a page that visibly doesn't belong: different outer spacing, header position, and text styling from everything around it. The two screenshots attached to this task show the mismatch.

## Desired UX

A user navigating from any other page to Stories should not notice a transition: same page padding and width rhythm, same header position, same title/description typography, same card, panel, badge, and empty-state styling language. Content and behavior of the page are unchanged — only the presentation is brought in line.

## Acceptance criteria

- [ ] Page container (outer padding, max width, centering, gap between header and content) matches the shared convention used by the other main pages rather than StoriesView's bespoke values.
- [ ] Page title and subtitle use the shared header pattern (`page-header` / `page-title` / `page-desc` or the equivalent shared styles), matching font size, weight, color and spacing of other pages.
- [ ] Story cards, chips, badges, progress bar and empty states reuse existing design tokens and shared styling instead of hardcoded/ad-hoc values.
- [ ] The two empty states (Stories disabled; no stories yet) match how other pages render empty/notice panels.
- [ ] Responsive behavior at the app's standard breakpoints is consistent with the other pages.
- [ ] Light and dark themes both render correctly (token-driven, no hardcoded colors).
- [ ] No functional change: story grouping, ordering, expand/collapse, status chips, progress, opening the task drawer, nav position and the `[stories]` config gate all behave exactly as before.
- [ ] `repoos check` passes.

## Notes for AI

- Main file: `src/ui-app/src/views/StoriesView.vue` (header markup near the top of `<template>`, scoped styles from ~line 207). Prefer adopting the shared classes other views use (`page-header`, `page-title`, `page-desc` — see `WorkView.vue`, `InputsView.vue`, `SettingsView.vue`) and keep `stories-*` classes only for genuinely story-specific pieces (grid, cards, chips).
- Check `src/ui-app/src/style.css` for existing panel/badge/page primitives before writing new CSS.
- Do not change data derivation (`src/core/stories.ts`), routing (`router.ts`), or nav placement (`nav.ts`); keep markup changes limited to what the restyling needs.
- Assumption: "match all the other pages" means the app's dominant shared conventions, not pixel-cloning one specific page. Where pages differ slightly, follow the common pattern.
- The screenshots attached to this task (under `## Screenshots`, served from `/api/tasks/0485/attachments/`) are the visual reference — compare Stories against a representative page like Work or Inputs.
- After any UI change, rebuild the UI (`bun run build:ui`) so the worktree build is fresh, and run `bun run fmt` before committing.

## Scope

In scope: spacing, positioning and styling of `StoriesView.vue` to align with existing page conventions, adopting shared styles where they exist. Out of scope: restyling any other page, changes to the Stories data model, config, nav placement or features, and any redesign beyond matching the existing look.

## Related

- #0480 — the task that added the Stories page

## Original prompt

Fix the spacing/positioning/style on the new Stories page to match all the other pages.

## Screenshots

![Screenshot-2026-09-22-at-13.06.34](/api/tasks/0485/attachments/screenshot-1.png)
![Screenshot-2026-09-22-at-13.06.07](/api/tasks/0485/attachments/screenshot-2.png)

## Activity

- 2026-09-22T15:52:13Z · created · hello@repoos.org
- 2026-09-22T15:52:13Z · screenshots
- 2026-09-22T15:52:13Z · screenshots
- 2026-09-22T15:53:08Z · status draft→inbox, title, area, type, body
- 2026-09-22T16:03:46Z · status inbox→ready
- 2026-09-22T18:08:09Z · status ready→active, branch
