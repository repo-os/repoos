---
id: "0007"
title: Light mode + theme setting in repoos.toml
type: feature
status: active
priority: p3
area: ui
assigned_to: ai
created_by: nick
branch: feat/0011-light-mode
created_at: "2026-05-29T00:00:00Z"
updated_at: "2026-05-29T00:00:00Z"
---
## Activity

- 2026-05-29T00:00:00Z · created · (migrated)

## Problem

The web UI is dark-only. Some operators want light mode (bright environments,
preference, accessibility). The UI already uses CSS variables for most colors,
which is the right foundation — but it was built dark-first, so there are
almost certainly hardcoded colors that won't follow a theme swap.

## Desired outcome

A light theme alongside the existing dark one, selectable via a `theme` setting
in `repoos.toml` (`dark` | `light` | `system`), defaulting to `system` (follow
OS `prefers-color-scheme`). Theme is cosmetic and live-editable — no restart.

## The real work (be honest about scope)

This is two jobs, and the second is bigger than the first:

1. **Add a light token set** — define light-mode values for every CSS variable.
2. **Complete the tokenization** — audit the UI for hardcoded colors that
   DON'T use a variable (inline SVG fills, rgba glass highlights, gradients,
   the neon glows) and convert them to tokens, or give them theme-aware values.
   This audit IS most of the work. A theme swap only works if nothing is baked
   in.

A light theme is NOT a mechanical inversion of dark. The neon/glow/glass
aesthetic is built for darkness — glows don't read on white, low-opacity white
highlights vanish, saturated neon looks garish on light. The light palette
needs its own considered treatment (softer accents, shadows instead of glows,
adjusted glass). Decide up front: "functional light mode" (acceptable, faster)
vs. "intentionally beautiful light mode" (more design work) — and scope
accordingly.

## Acceptance criteria

- [ ] Light token set defined for ALL theme variables
- [ ] Audit complete: no hardcoded colors remain that ignore the theme — inline
      SVG fills/strokes, rgba highlights, gradients, glow shadows all respond to
      the active theme (or have explicit per-theme values)
- [ ] `theme` setting in repoos.toml: `dark` | `light` | `system`
- [ ] `system` follows OS `prefers-color-scheme` and updates live if the OS
      setting changes while open
- [ ] Theme applies live (no restart) — it's the cosmetic, live-editable tier
- [ ] Both themes are legible: text contrast, status colors (the status dot
      palette: inbox/ready/active/review/done), priority badges, and the live
      feed all read clearly in BOTH themes
- [ ] Glows/glass that look wrong on light are handled (shadows or reduced
      treatment in light), not just left glowing on white
- [ ] No flash of wrong theme on load (apply the resolved theme before first
      paint, not after Vue mounts)

## Notes for AI

- The variable foundation exists (`:root` defines `--bg`, `--txt`, `--cyan`,
  etc.). The mechanism is: a second value set applied via a `data-theme` attr
  or class on the root, OR a `prefers-color-scheme` media block — pick one
  approach and apply it consistently.
- The bulk of the effort is the AUDIT, not adding the palette. Grep the UI for
  literal hex, `rgb(`, `rgba(`, and inline SVG `fill=`/`stroke=` with hardcoded
  colors. Each one either becomes a token or gets a per-theme value. Be
  thorough — a single missed hardcoded background is the bug that makes light
  mode look broken.
- Do NOT just invert dark values. Author the light palette deliberately. Glows
  (box-shadow with colored blur) generally need replacing with subtle neutral
  shadows in light mode, not lightened glows.
- No flash-of-wrong-theme: resolve and apply the theme (incl. reading the toml
  setting / OS preference) as early as possible, ideally before Vue mounts, so
  the first paint is correct.
- Theme is cosmetic + live-editable — when settings UI (#0009) lands, theme is
  one of its live-editable fields. Design the read/apply path so the settings UI
  can flip it without reload.
- Frontmatter uses `created_at` (UTC/Z) per current format — match 0007.

## Scope

- v1: dark + light + system, toml setting, live apply, clean audit.
- Defer: additional themes, per-element theme overrides, high-contrast mode.
  Note the intent; don't build.

## Related

- Pairs with settings UI (#0009) — theme is a cosmetic live-editable field there.
- Pure UI; no server-logic change beyond exposing/accepting the `theme` config.
