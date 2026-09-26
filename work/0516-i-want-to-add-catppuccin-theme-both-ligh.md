---
id: "0516"
title: "title: Add Catppuccin light and dark themes"
type: feature
status: ready
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: opencode
model_override: opencode-go/space-bunny-free
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-26T08:19:31Z"
updated_at: "2026-09-26T08:35:34Z"
---
title: Add Catppuccin light and dark themes
type: feature
priority: p2
area: web
assigned_to: ai
---

## Problem

RepoOS ships a single fixed theme. There is no way to run the UI in a Catppuccin
palette, so the app's look is not personalisable and does not match the Catppuccin
set users may already have configured in their terminal and editor. Two variants are
wanted: the Catppuccin Latte (light) flavour and the Catppuccin Mocha (dark)
flavour, so a user can pick either.

## Desired UX

- A user can choose Catppuccin Latte, Catppuccin Mocha, or the existing default
  theme from the existing theme control in Settings.
- Selecting a variant immediately re-themes the running app — backgrounds,
  surfaces, text, borders, and accents all resolve to the correct Catppuccin
  colour roles for that variant, with readable contrast in both light and dark.
- The selection persists across reloads, the same way the current theme selection
  does.
- All existing views (board, task drawer, dialogs, diffs/code, charts) render
  correctly in both Catppuccin variants, with no hardcoded colours left behind
  that clash with the palette.

## Acceptance criteria

- [ ] Catppuccin Latte and Catppuccin Mocha are both selectable in Settings
      alongside the existing default theme.
- [ ] Selecting either variant repaints the whole app — every screen, drawer,
      dialog, and shared form control — with no unthemed or hardcoded-colour
      regions visible.
- [ ] Text, borders, and interactive controls meet the repo's existing
      theme-contrast guard (see `repoos check`) in both Catppuccin variants.
- [ ] Code/diff rendering still uses the existing highlighter theme pipeline
      correctly under both Catppuccin variants; if a Catppuccin shiki theme is
      available, it is used rather than hand-rolled colours.
- [ ] The chosen variant survives a page reload, matching current theme
      persistence behaviour.
- [ ] If a "system" preference exists today, it still resolves sensibly and the
      two new Catppuccin variants are reachable from the same control.
- [ ] Tests added covering theme selection/persistence and the resolved palette
      for both variants.
- [ ] `repoos check` passes.

## Notes for AI

- **Colours: use shikijs, do not hand-type or web-search a palette.** This repo
  already has `shikijs` installed and it ships bundled Catppuccin themes. Read
  the exact hex values out of the installed package rather than transcribing
  them from memory or from the web — a typo'd hex is silent and hard to spot.
  Derive the UI token values (background, surface, border, text, muted text,
  accent) from that source of truth and keep the mapping in one place.
- The palette must be defined per variant (Latte light, Mocha dark) — do not
  share a single set of values across both.
- Follow the existing theme mechanism rather than adding a parallel one: extend
  the current theme token/palette definition and the existing Settings control
  that drives it, and reuse the existing persistence path.
- Keep with the repo's CSS conventions: dialog/modal styling lives in
  `src/ui-app/src/style.css` (body-teleported), not in a component's
  `<style scoped>` block. Global theme tokens belong in the shared stylesheet.
- Do not hardcode hex values inside individual components — variants must be
  selected by token/class, not by scattered per-component conditionals.
- Preserve accessibility: both variants must pass the existing theme-contrast
  guard, not just "look right".
- Do not widen the formatter's scope and do not add runtime dependencies —
  shikijs is already a dev dependency in this repo, so pulling colour data out
  of it does not change the zero-runtime-dependency constraint.
- Run `bun run fmt` before committing on the task branch, then `repoos check`.
- If any existing doc describes the available themes (Settings copy, `user-docs/`
  theme documentation, `AGENTS.md` theme-contrast rule), update the lines this
  change makes wrong as part of the same task.

## Scope

**In scope:** the two Catppuccin variants (Latte and Mocha) as selectable
themes, their palette tokens, persistence, coverage across all existing views
and shared components, and tests.

**Deferred / not in scope:** importing arbitrary external user themes, a theme
marketplace or hot-reload of theme files, per-component theme overrides, and
any restyling/redesign of existing screens beyond what the new palettes require.

## Related

- `src/ui-app/src/` — theme tokens, settings control, and shared `style.css`
- `repoos check` — theme-contrast guard, which both variants must pass

## Original prompt

I want to add Catppuccin theme (both light and dark options) to RepoOS. If you don't know the colors and don't want to do a web search to find them, in this repo there's already shikijs lib installed which may already define it for you.

## Activity

- 2026-09-26T08:19:31Z · created · hello@repoos.org
- 2026-09-26T08:19:46Z · status draft→inbox, title, body
- 2026-09-26T08:35:13Z · cli_override, model_override
- 2026-09-26T08:35:15Z · model_override
- 2026-09-26T08:35:30Z · review_cli_override
- 2026-09-26T08:35:32Z · review_model_override
- 2026-09-26T08:35:34Z · status inbox→ready
