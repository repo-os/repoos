---
id: "0048"
title: Make the search input's focused state prettier and less boxy
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/make-the-search-input-s-focused-state-pr
created_at: "2026-08-06T17:20:48Z"
updated_at: "2026-08-06T17:21:27Z"
---
## Problem

The global search bar (⌘K, added in 0022) renders its selected/focused state
with a hard boxed look: the input sits in a filled panel box with a 1px border,
and on focus it snaps to a full border-color change plus a rigid 1px outline
ring (`box-shadow: 0 0 0 1px var(--cyan-dim)`). The transition is jarring and
the result reads as a plain rectangle rather than an integrated, soft control.
It stands out against the rest of the UI, which already uses pills, soft
glows, and blurred glass surfaces.

## Desired UX

When the search input is focused (clicked, tabbed to, or selected via ⌘K), it
should look refined, soft, and clearly active — not like a box with a border
drawn around it. The active state should:

- Use a pill-shaped / more rounded silhouette instead of the boxy rectangle.
- Signal focus with a soft treatment (subtle glow, accent tint, or gentle
  shadow) rather than a hard outline ring.
- Blend with the current theme — the clear and gen z theme overrides must keep
  working, and the dark default theme should keep its existing accent colors.

## Acceptance criteria

- [ ] The focused/active state of the global search input no longer uses the
      hard boxed look (solid border change + 1px outline ring via
      `box-shadow: 0 0 0 1px …`)
- [ ] Focus is still clearly visible: the input is obviously active at a
      glance, using a soft glow / accent tint / rounded pill treatment built
      from existing CSS variables (e.g. `--cyan-dim`, `--border`, `--panel`)
- [ ] The selected/focused state is noticeably less boxy than today (larger
      radius and/or softer boundary), consistent with existing pill-shaped
      elements in the UI
- [ ] Unfocused appearance is unchanged or only minimally adjusted; no
      regression to layout or the 380px flex sizing of `.search-wrap`
- [ ] Existing theme overrides keep working: `[data-ui-theme="clear"]`
      (~line 646) and `[data-ui-theme="gen z"]` (~lines 753-754) in
      `src/ui-app/src/style.css`
- [ ] ⌘K select-on-focus, keyboard navigation, and dropdown behavior unchanged
- [ ] `repoos check` passes; no new runtime dependencies

## Notes for AI

- Assumption: "selected input state" = the focused/active state of the global
  search input (click, Tab, or ⌘K). This task does NOT restyle the highlighted
  dropdown row (`.search-row.hi`) unless it is trivially part of the same
  polish.
- This is intended to be a CSS-only change. Primary touchpoint:
  `src/ui-app/src/style.css` — `.search-input` and `.search-input:focus-within`
  (~lines 168-171). Only touch
  `src/ui-app/src/components/SearchBar.vue` if a markup change is genuinely
  needed.
- Reuse existing CSS variables; do not introduce a new color palette or
  hardcoded hex values that break the theme system.
- Keep the change minimal and consistent: match the softness/rounding already
  used elsewhere in the UI (chips, `.conn` pills, glass panels) rather than
  inventing a new visual language.
- After the change, rebuild (`bun run build:ui`) and verify `repoos check`.
  Keep a `repoos serve` running and probe the UI to confirm the focus state
  looks right in the browser.

## Scope

- In scope: visual polish of the search input's focused/selected state — softer
  border, rounding, and focus treatment.
- Deferred: search result dropdown restyling, search behavior, and the legacy
  pre-vite `src/ui` UI.

## Related

- 0022 · Global search bar (added the search input this task polishes)
- 0024 · Search enhancements
- 0030 · Color-coded task results in the search dropdown

## Activity

- 2026-08-06T17:20:48Z · created · unknown
- 2026-08-06T17:21:25Z · status inbox→ready
- 2026-08-06T17:21:27Z · status ready→active, branch
- 2026-08-06T17:27:19Z · status active→review
