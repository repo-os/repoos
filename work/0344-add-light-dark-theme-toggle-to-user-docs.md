---
id: "0344"
title: "Add light/dark theme toggle to user-docs, matching landing page's palette"
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-light-dark-theme-toggle-to-user-docs
review_model_override: opencode-go/deepseek-v4-pro
created_at: "2026-09-14T02:47:42Z"
updated_at: "2026-09-14T09:22:27Z"
---
docs.repoos.org (user-docs/) is dark-only right now — `appearance: "force-dark"`
in `.vitepress/config.mts` disables VitePress's own built-in light/dark toggle
entirely, and `user-docs/.vitepress/theme/custom.css` only defines dark values
for VitePress's `--vp-c-*` design tokens. repoos.org (landing/) already has a
working light/dark toggle (`landing/src/App.vue`'s `.theme-toggle` button +
`landing/src/style.css`'s token system) — nothing like it exists here.

## What to do

1. Re-enable VitePress's built-in appearance toggle: change `appearance` in
   `config.mts` from `"force-dark"` to `true` (or `"dark"` for a dark default
   that's still togglable — check which one VitePress expects for "default
   dark, user can switch"). Remove or adjust the `document.documentElement
   .classList.add("dark")` head script, which currently forces dark
   unconditionally before paint — VitePress's own toggle needs to own that
   decision instead once enabled.
2. Add light-mode values for every `--vp-c-*` custom property currently only
   defined for dark in `custom.css`, matching the light values already defined
   in `landing/src/style.css`'s `[data-theme="light"] { ... }` block — same
   background/text/border colors, and the SAME darkened accent overrides
   (cyan/violet/green/amber/red get contrast-safe counterparts on white,
   already worked out there; don't redo that work, port the values). Nick
   explicitly wants the two sites to look like the same product, not two
   different themes that happen to share a name.
3. VitePress applies light/dark via a `dark` class on `<html>`, not the
   `data-theme` attribute landing/ uses — the CSS selector strategy will differ
   (likely `:root { ... }` for light defaults, `.dark { ... }` overrides for
   dark, opposite of landing's light-is-the-override structure) but the actual
   color VALUES should match landing's tokens exactly.
4. Code blocks / custom containers: landing/ keeps its terminal-styled surfaces
   (`.term`, `.file-card`, `.install-box`) dark in BOTH themes deliberately
   (see the commit that added the toggle). Decide deliberately whether
   VitePress's code blocks should do the same (stay dark in light mode, common
   for docs sites) or follow the page theme — don't leave it as an accident of
   which tokens got overridden.

## Verify

`just user-docs-dev` / `just user-docs-build`, check both themes render
correctly, check the toggle persists across page navigation (VitePress is an
SPA after the first load) and reload, and spot-check contrast in light mode
the way landing's light theme was verified (WCAG-reasonable contrast, not just
"text is technically visible").

Note: `repoos check` does not cover this directory — verify by actually
looking at both themes in a browser, not just a clean build.

## Activity

- 2026-09-14T02:47:42Z · created · unknown
- 2026-09-14T06:35:08Z · status inbox→ready
- 2026-09-14T08:00:23Z · review_model_override
- 2026-09-14T08:00:31Z · status ready→active, branch
- 2026-09-14T08:09:15Z · status active→review
- 2026-09-14T09:22:27Z · status review→done, release:success
