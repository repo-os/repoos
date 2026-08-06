---
id: "0033"
title: "Add a 'gen z' design theme"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ai
branch: feat/0033-gen-z-theme
created_at: "2026-08-06T10:00:00Z"
updated_at: "2026-08-06T12:15:00Z"
---
## Activity

- 2026-08-06T10:00:00Z · created · ai
- 2026-08-06T11:30:00Z · status active→review · ai — implemented; `repoos check`
  green (incl. theme-contrast gate on the new gen-z token blocks); browser-verified
  all three themes in dark + light with zero console errors
- 2026-08-06T12:15:00Z · review→review · ai — review feedback: gen-z now uses an
  unmistakably rounded font (Baloo 2 body + Bricolage Grotesque display, both
  confirmed loaded); the dark/light/system preference in Settings now applies
  live the moment it changes (no Save click) with a smooth cross-fade
  (theme-anim); re-verified, `repoos check` green

## Problem

RepoOS has two design themes: "classic" (neon-on-navy) and "clear" (calm,
spacious, tactile). Users want a third option — **"gen z"** — as a bold,
playful, internet-native counterpoint that makes the tool feel expressive
without getting in the way of the dense board/kanban work it exists for.

## Desired UX

A third design theme named **"gen z"** selectable from the same theme toggle.
It follows this direction:

- **Expressive typography**: a distinctive display/heading font with a fun
  personality, used for titles and empty states; body text stays legible
- **Bright accents**: saturated, joyful accent colors (think sticker-pack
  vibes) used for status, tags, active nav, and primary actions
- **Oversized rounded elements**: chunky buttons, big radii, pill-shaped
  controls, generous card corners
- **Sticker-like icons**: playful, bold, slightly chunky iconography
- **Casual microcopy**: friendly, lowercase-leaning copy in empty states and
  tooltips (e.g. "nothing here yet — go add something") WITHOUT sounding like
  forced youth marketing
- **Subtle motion**: playful micro-interactions — bouncy hover lifts, quick
  wobble/bounce on interactive press — all behind `prefers-reduced-motion`
- **Chunky controls + soft shadows**: thick-feeling interactive elements with
  soft, colorful shadows
- **Hand-drawn/imperfect details**: slight rotations on stickers/empty-state
  art, imperfect borders on decorative elements

**Avoid**: sterile corporate aesthetics, generic gradients, excessive
minimalism, and any forced "marketing to gen z" tone.

The "classic" and "clear" themes keep their current appearance. Gen z has its
own dark and light variants, driven by the existing dark/light/system
preference, exactly like clear does.

## Acceptance criteria

- [ ] `uiTheme` config accepts a third value (`"classic" | "clear" | "gen z"`,
      default stays `"classic"`); `repoos.toml`, `/api/config`, schema-driven
      Settings, and the sidebar toggle all support it
- [ ] Selecting it applies `data-ui-theme="gen z"` on `<html>` immediately and
      persists across sessions
- [ ] Gen z has intentional dark and light variants with bold, playful tokens
      (bright accent/status colors, chunky radii, soft colored shadows) —
      distinct from both classic and clear
- [ ] Playful motion (bouncy hovers/presses) is guarded by
      `prefers-reduced-motion`
- [ ] Casual microcopy + sticker-like empty states / icons are in place on at
      least the main board view
- [ ] All tokens live in CSS custom properties (later blocks in style.css);
      no new runtime dependency
- [ ] Classic and clear appearances are unchanged; `repoos check` passes
  (including the theme-contrast gate — every gen-z fg/bg pair must hold ≥3:1
  and button tokens must be gradients)
- [ ] All existing screens remain functional

## Notes for AI

- Build on the 0032 theme infra: `UiTheme` union in `src/core/types.ts`,
  config/schema in `src/core/config.ts`, store in
  `src/ui-app/src/stores/config.ts`, toggle in
  `src/ui-app/src/components/Sidebar.vue` (extends to 3 segments), token
  blocks + overrides in `src/ui-app/src/style.css`.
- Do NOT touch `src/ui-app/src/views/SettingsView.vue` (work/0006 owns it);
  the schema field renders automatically.
- The `theme-contrast` gate in `src/commands/check.ts` already knows about a
  `"gen-z"` variant (`:root[data-ui-theme="gen-z"]` and its `[data-theme="light"]`
  block) — name the token blocks exactly `:root[data-ui-theme="gen-z"]` /
  `:root[data-ui-theme="gen-z"][data-theme="light"]` or update the map.
- Add the display font to the Google Fonts URL in `src/ui-app/index.html` and
  point gen-z's `--font-sans` / a new `--font-display` token at it.
- The theme toggle is currently a 2-segment switch; a 3rd segment must fit the
  sidebar layout without overflow at narrow widths.
- Pure view-layer/config change: no task data, core engine, or server logic
  changes. After the UI change, rebuild, restart `repoos serve`, and probe all
  three themes (dark + light) via the browser before reporting done.
