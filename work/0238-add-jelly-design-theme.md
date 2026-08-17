---
id: "0238"
title: Add jelly design theme
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-jelly-design-theme
model_override: default
pm_model_override: default
created_at: "2026-08-16T19:05:22Z"
updated_at: "2026-08-17T03:30:00Z"
---
## Problem

The web UI currently offers three design themes (`uiTheme`): Classic, Clear, and Gen Z. There is no way to apply a "jelly" visual style. The "67" in the request is treated as noise — this is a new theme, not a numbered variant or priority.

## Desired UX

The user picks **Jelly** from the **Design theme** dropdown in Settings. The whole UI switches immediately (with the same theme-transition animation as existing design themes), works in both dark and light mode, and the choice persists across reloads. The default remains Classic until the user changes it.

## Acceptance criteria

- [ ] `UiTheme` in `src/core/types.ts` includes `"jelly"`
- [ ] "Jelly" appears as an option in the Design theme select in the config schema (`src/core/config.ts`), live tier, no restart required
- [ ] `src/ui-app/src/style.css` defines `:root[data-ui-theme="jelly"]` blocks for both dark and light variants using the existing token set
- [ ] New theme variants are registered in `THEME_VARIANTS` and `THEME_INHERIT` in `src/commands/check.ts` so the theme-contrast gate validates them
- [ ] All contrast-pair and gradient-token rules pass: `--btn-primary-bg` / `--btn-new-bg` are gradients, every fg/bg pair in `CONTRAST_PAIRS` meets WCAG contrast
- [ ] `repoos check` passes (build, tests, theme-contrast gate, UI smoke test)
- [ ] Default `uiTheme` stays `"classic"`; no behavior change until the user selects Jelly

## Notes for AI

- "Jelly" is a third *design* theme in the `uiTheme` system (like clear / gen z) — it is **not** a new value for the light/dark `theme` setting. Design it as soft, glossy, translucent, bouncy/gel-inspired: glassy surfaces, saturated accents, gentle inner glows, rounded feel.
- Reuse the existing token set (`--bg`, `--txt`, `--txt-dim`, `--btn-primary-bg`, `--nav-active-bg`, etc.); do not invent new design tokens unless truly necessary. Every token in `CONTRAST_PAIRS` must be defined in each new block, and `--btn-primary-bg` / `--btn-new-bg` must remain gradients (they're consumed via `background-image` — a solid color renders transparent buttons).
- The theme-contrast gate in `src/commands/check.ts` only validates variants it knows about — omitting the new selectors from `THEME_VARIANTS` / `THEME_INHERIT` will silently skip the new theme, not fail.
- Do not change `DEFAULT_CONFIG.uiTheme`.
- After any `style.css` change, rebuild (`bun run build:ui` for speed, or `bun run build`) before running `repoos check`.
- No runtime dependencies.

## Scope

- **In:** new `uiTheme` value, config wiring, CSS token blocks (dark + light), theme-contrast gate registration, persistence via the existing `PATCH /api/config` path.
- **Deferred:** changes to the light/dark/system `theme` setting, default-theme switching logic, and any new CSS tokens beyond the existing set.

## Activity

- 2026-08-16T19:05:22Z · created · unknown
- 2026-08-16T19:06:08Z · status inbox→ready
- 2026-08-16T19:06:42Z · status ready→active, branch
- 2026-08-16T19:06:57Z · model_override
- 2026-08-16T19:07:04Z · pm_model_override
- 2026-08-17T03:27:26Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-17T03:29:47Z · status review→active
