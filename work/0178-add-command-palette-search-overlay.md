---
id: "0178"
title: Add command-palette search overlay
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-13T16:15:20Z"
updated_at: "2026-08-13T16:15:20Z"
---
## Problem

The current search experience is a plain search bar inline in the page. It is
undiscoverable as a quick-navigation tool and cramped for anything but a
one-line query. On tech-heavy sites a full-screen or large centered search
overlay triggered by click or `cmd+k` has become the expected pattern for
instant access to search. The search bar also needs to honor the app's
existing themes, which the current inline bar does not fully account for.

## Desired UX

- Clicking the existing search bar opens a large search overlay instead of
  behaving as an inline input.
- Pressing `cmd+k` anywhere in the app opens the same overlay.
- The overlay takes up a large, prominent portion of the screen (the common
  "command palette / spotlight" presentation), with the search input focused
  and ready for typing.
- The overlay's colors, backgrounds, and accent colors follow the app's
  existing theme system so it looks native in each theme, matching the
  current theme the user has selected.

## Acceptance criteria

- [ ] Clicking the search bar opens the search overlay.
- [ ] Pressing `cmd+k` opens the search overlay from anywhere in the app.
- [ ] The overlay is large and centered on screen in the command-palette style.
- [ ] Search input inside the overlay is focused automatically when it opens.
- [ ] The overlay renders correctly with the app's various themes and matches
      the active theme's color scheme.
- [ ] Results from the existing search functionality still work inside the
      overlay (existing search behavior is preserved, just re-presented).
- [ ] `repoos check` passes with the change.

## Notes for AI

- Work in `src/ui-app` (the Vite + Vue 3 web UI). Touch the search bar
  component and the relevant styles; keep the existing search logic/API and
  only change the presentation.
- Reuse the existing theme system for the overlay colors; do not hardcode
  palette values.
- Assumptions made where unspecified:
  - `cmd+k` should work globally in the app (any page/view), not only when
    the search bar is in focus.
  - The overlay is dismissible with `Esc` or by clicking outside of it.
  - Only the trigger and presentation change; querying behavior and results
    are unchanged.
- After any UI change, rebuild (`bun run build:ui` for speed, or
  `bun run build`) and verify the overlay in each theme before reporting done.
- Do not change task file format, frontmatter schema, or the parser.

## Scope

Covers the search overlay trigger (click + `cmd+k`), its large command-palette
presentation, and theme-aware styling. Deferred: keyboard navigation of
results, fuzzy matching improvements, or any change to the underlying search
backend.

## Related

- Existing search bar implementation and theme system in `src/ui-app`.

## Activity

- 2026-08-13T16:15:20Z · created · unknown
