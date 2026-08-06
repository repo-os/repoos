---
id: "0032"
title: "Add a 'clear' design theme and a classic/clear theme toggle"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0032-clear-theme-toggle
created_at: "2026-08-05T17:10:00Z"
updated_at: "2026-08-05T18:50:00Z"
---
## Activity

- 2026-08-05T17:10:00Z · created · human
- 2026-08-05T18:20:00Z · status active→review · ai — implemented; `repoos check` green
- 2026-08-05T18:50:00Z · review→review · ai — review feedback: clear now uses its own
  font (Plus Jakarta Sans via `--font-sans`) and a comfortable-density pass
  (roomier paddings/gaps, taller line-heights); re-verified, `repoos check` green

## Problem

RepoOS has exactly one visual design (currently dark/light color variants of the
same "classic" neon-on-navy look). Users want a second, calmer visual design
option with its own identity, plus a way to switch between designs and persist
the choice. The existing "classic" theme must keep working unchanged.

## Desired UX

Add a second design theme named **"clear"** and a toggle between **classic** and
**clear**. The two design themes are orthogonal to the existing dark/light/
system color preference: both classic and clear have their own dark and light
variants, and the dark/light/system switch keeps working inside whichever
design theme is selected.

The clear theme follows this direction (Fizzy tactile personality + Airbnb
clarity/spacing/polish, adapted to a dense developer tool):

- Calm, spacious, softly layered surfaces instead of neon-on-navy
- Tactile controls: softly rounded containers, subtle press feedback, small
  purposeful shadows
- Light variant: warm off-white background, near-white raised surfaces, dark
  charcoal text, muted warm-gray borders, approachable accent
- Dark variant: deep calm charcoal, slightly lighter elevated panels, warm
  off-white primary text, muted cool-gray secondary text, borders + surface
  contrast instead of glow
- Consistent radius/shadow/elevation system driven by tokens
- A gentle theme transition (~120–220ms) that respects `prefers-reduced-motion`

The "classic" theme is preserved visually as-is. Classic only changes where the
new functionality (the theme toggle itself) needs it.

## Acceptance criteria

- [ ] A `uiTheme` config option (`"classic" | "clear"`, default `"classic"`)
      exists in `repoos.toml`, is served by `/api/config`, and appears in the
      schema-driven Settings page
- [ ] Selecting the design theme applies `data-ui-theme="classic|clear"` on
      `<html>` immediately and persists across sessions
- [ ] The clear theme has intentional dark and light variants that follow the
      existing `theme` (dark/light/system) preference — no neon-on-navy, no
      pure-black, no inverted-light look
- [ ] The clear theme uses its own font (e.g. Plus Jakarta Sans) via a
      `--font-sans` token — visually distinct from classic's Sora, with
      comfortable density (roomier paddings/gaps) and clearer body text
- [ ] Clear theme surfaces/text/borders/status/actions are defined as tokens
      (CSS custom properties) so components restyle without per-component
      hardcoded colors
- [ ] The dark/light/system preference, and classic's appearance, are unchanged
- [ ] A theme toggle (Classic / Clear) is reachable from the app shell (e.g.
      sidebar) and updates the UI live without a reload
- [ ] All existing screens remain functional; `repoos check` passes
- [ ] No new runtime dependency

## Notes for AI

- Design direction (Fizzy/Airbnb reference, full component guidance): see the
  original brief in the task that spawned this one — the clear theme is its
  first deliverable: semantic tokens, restyled shell/surfaces, restrained
  radius/shadow system, calm both-theme palettes.
- Files:
  - `src/core/types.ts` — add `UiTheme` type + `uiTheme?: UiTheme`
  - `src/core/config.ts` — `DEFAULT_CONFIG.uiTheme`, toml parse of
    `uiTheme`, schema field (`type: "select"`, tier live)
  - `src/ui-app/src/stores/config.ts` — `uiTheme` state, `applyUiTheme`,
    `setUiTheme` (PATCH `/api/config`), apply on load/save
  - `src/ui-app/src/components/Sidebar.vue` — Classic/Clear segmented toggle
  - `src/ui-app/src/style.css` — `[data-ui-theme="clear"]` token blocks
    (dark default + `[data-theme="light"]`) after the existing `:root` and
    `[data-theme="light"]` blocks; targeted component overrides under
    `[data-ui-theme="clear"]` (radius, shadows, button press, calm body
    background); `prefers-reduced-motion` guard
- Do NOT touch `src/ui-app/src/views/SettingsView.vue` — work/0006 is building
  the settings UI concurrently; the new schema field renders automatically.
- Reuse the existing `theme` (dark/light/system) plumbing; the design theme is
  an additional dimension only.
- Classic keeps its tokens untouched; clear overrides them via a later block.
- Pure view-layer/config change: no task data, core engine, or server logic
  changes. After the UI change, rebuild and keep `repoos serve` running.
