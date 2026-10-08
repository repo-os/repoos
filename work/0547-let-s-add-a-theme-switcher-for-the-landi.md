---
id: "0547"
title: Add a gruvbox theme switcher to the landing page
type: feature
status: done
priority: p2
area: landing
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-a-gruvbox-theme-switcher-to-the-land
created_at: "2026-09-27T11:55:28Z"
updated_at: "2026-09-27T13:29:07Z"
---
## Problem

`landing/` (repoos.org) has exactly one design identity with two appearances: a
dark-default token set in `:root`, a `[data-theme="light"]` override, and a 32px
icon button in the sticky nav that flips `data-theme` on `<html>` between `dark`
and `light`. There is no way to choose a *design* theme — the site always looks
like the app's Classic theme, so the gruvbox design language that already ships
in the product (`src/ui-app/src/style.css`, `[data-ui-theme="gruvbox"]`, added
in #0503) is invisible to anyone who lands on repoos.org first. RepoOS's
audience is CTOs and builders, and a landing page that shows off a real coding
theme — with both its light and dark variants done properly — reads as a product
with taste rather than a brochure.

## Desired UX

- The nav's theme control becomes a switcher: the visitor picks a design theme
(Classic, Gruvbox) and an appearance (dark / light) independently, and the
whole page repaints instantly with no flash on the next load.
- Gruvbox is recognisably gruvbox on the landing page, not Classic recoloured:
warm charcoal in dark, cream in light, hairline warm borders, flat opaque
panels, no neon glow, tight 4–8px radii. Both appearances use the values
already shipped in the app's gruvbox block so the two surfaces can't drift.
- The appearance control keeps behaving exactly as it does today, including
persisting across reloads and honouring `prefers-color-scheme` on first visit.
- Terminal, file-card and install-box surfaces keep the dark gruvbox palette in
both appearances, matching how those surfaces already behave under Classic
light.
- Keyboard reachable, labelled for screen readers, usable in the collapsed
mobile nav.
- Shareable links: `?theme=` and `?appearance=` (alias `?mode=`) set the design
theme and light/dark on first load — e.g. `repoos.org/?theme=gruvbox&appearance=light`.
Valid design ids include `classic`, `gruvbox`, and any future theme id once its
CSS exists (`catppuccin`, `ayu`, …). URL params beat `localStorage` for that
load, then persist so a reload without the query keeps the choice.

## Acceptance criteria

- [ ] Design theme and appearance are two independent axes
    (`classic|gruvbox` × `dark|light`); all four combinations render with
    correct contrast and no hardcoded colour leaks from the old
    single-identity palette.
- [ ] `data-theme` keeps its current `dark`/`light` meaning on `<html>`, and
    the design theme is applied the way the app does it (`data-ui-theme`), so
    the two codebases read alike.
- [ ] Gruvbox landing tokens are lifted from `src/ui-app/src/style.css`
    (`[data-ui-theme="gruvbox"]` and `[data-ui-theme="gruvbox"][data-theme="light"]`)
    and re-expressed in the landing's own token vocabulary — every custom
    property the landing declares in `:root` is overridden in both gruvbox
    blocks, including the ones the app has no equivalent for
    (`--glow-1`, `--glow-2`, `--code-bg`, `--code-bar-bg`, `--nav-bg`,
    `--foot-bg`, `--shot-shadow`, `--glow-ring`, `--selection-bg`,
    `--selection-txt`).
- [ ] The pre-paint script in `landing/index.html` resolves both axes before
    first paint (still inline and synchronous), so no load shows the wrong
    theme; `<meta name="theme-color">` reflects the resolved design theme *and*
    appearance, not just the appearance.
- [ ] The chosen design theme survives a reload; a first-time visitor with no
    stored choice still gets the OS appearance preference, and blocked
    `localStorage` falls back cleanly to the current default instead of
    throwing.
- [ ] Existing visitors keep the appearance they already chose (the stored key
    still means light/dark); the design theme gets its own new key.
- [ ] The switcher is a real control: `aria-label`/`title` on each option,
    keyboard operable, a focus-visible ring, and it works in the collapsed
    mobile nav.
- [ ] The switcher doesn't break the existing nav layout at any breakpoint, and
    it uses the same hand-rolled control styling as the rest of the site (no
    unstyled `<select>`, no colours outside the `style.css` tokens).
- [ ] `cd landing && bun run build` (vue-tsc + vite build) passes and
    `repoos check` is green — including the `landing-build` step and the
    app's theme-contrast guard, which must still pass unchanged for the app's
    own themes.
- [ ] `landing/README.md` documents the switcher and the two-axis model.
- [ ] Query params `theme` and `appearance` (`mode` alias) resolve in the
    pre-paint script with the same rules as `landing/src/theme-resolve.ts`
    (keep both in sync). Invalid values are ignored per axis. Using the nav
    switcher updates the query string via `history.replaceState` so the
    address bar reflects a shareable link.

## Notes for AI

Files to touch:

- `landing/src/style.css` — `:root` / `[data-theme="light"]` gain
`[data-ui-theme="gruvbox"]` and `[data-ui-theme="gruvbox"][data-theme="light"]`
blocks, plus the switcher's own rules. The `.term` / `.file-card` /
`.install-box` dark-surface re-declaration needs its selectors widened from
`[data-theme="light"]` to cover gruvbox's dark palette as well.
- `landing/src/App.vue` — `Theme` becomes two independent refs;
`toggleTheme` becomes the switcher; persist and restore.
- `landing/index.html` — the pre-paint resolver and the `theme-color` content
per combination.
- `landing/src/theme-resolve.ts` — shared parse/apply/persist/URL helpers used
by the Vue app; boot script in `index.html` mirrors this file.

Constraints:

- The landing site is a standalone deployable with its own lockfile and
pipeline and shares no code with `src/ui-app`. Do not import from the app, do
not add a shared package, and do not add a runtime dependency. Copy the
values, cite the app block in a comment, and keep that coupling a comment
rather than a build step.
- Gruvbox is deliberately flat — opaque panels, hairline warm borders, no
glow, no glass. The landing's existing `--glow-*`, `--shot-shadow`,
`--nav-bg` and `--foot-bg` gradients are glow language; do not carry neon
into gruvbox, set them quiet or neutral instead.
- The app's gruvbox block warns that `repoos check`'s theme-contrast guard
parses theme blocks line-by-line, and a `/* … */` comment *between
declarations* corrupts the following key. That guard only reads
`src/ui-app/src/style.css` (`[check] uiStylesheet`), so landing isn't
machine-checked — keep the same comment discipline anyway so the blocks stay
diffable and portable.
- The landing has no test suite and no contrast guard. The app's gruvbox values
already pass the app's guard, so reusing them verbatim is the contrast safety
net; check all four combinations by eye regardless, since "it looks right" is
the point of this task.
- Use the custom styled control for the picker, never a native `<select>`, and
put its CSS in `style.css` (the landing has no `<style scoped>` blocks to
grow).

Assumptions (the prompt did not specify these):

- Terminal / file-card / install-box surfaces stay **dark gruvbox in both
appearances**, mirroring how they already stay dark under Classic light — a
cream terminal block would undercut the coding-theme effect.
- Landing keeps its own `repoos-theme` appearance key and gains a separate
design-theme key, rather than adopting the app's `repoos.theme` /
`repoos.favoriteThemes` keys; a shared key would couple two independently
deployed sites' storage for no user-visible gain.
- The picker offers exactly the two named design themes (Classic, Gruvbox).
The app's other themes (Clear, Gen Z, Jelly, Catppuccin) are out of scope —
say so rather than half-adding them.

## Scope

In: the gruvbox design theme for the landing page in both appearances, the
switcher control, persistence, pre-paint / `theme-color` handling, and shareable
`?theme=` / `?appearance=` URLs (forward-compatible with future design themes).

Deferred:

- A theme switcher for the VitePress `user-docs/` site — the user flagged this
as a possible follow-up if this looks good. Do not touch `user-docs/`.
- The app's other themes on the landing page.
- Syncing landing theme choices with the app's theme keys across the two sites.

## Related

- #0503 — added gruvbox to the app; source of the palette.
- #0526, #0255 — the app's quick theme switcher and theme favourites.
- #0504 — theme-contrast guard hardening, and the comment-inside-theme-block
rule that came out of it.
- `landing/README.md`; `src/ui-app/src/style.css` (gruvbox block).

## Original prompt

Let's add a theme switcher for the landing page and the first additional theme should be gruvbox (lsame as on repoos app) and remember to do both light and dark. Since the target audience of RepoOS is CTOs and builders they'll appreciate some coding themes 😃 and take the project more seriously when they see it. If it looks good I may add a theme switcher to the vitepress/user-docs next.

## Activity

- 2026-09-27T11:55:28Z · created · hello@repoos.org
- 2026-09-27T11:57:14Z · status draft→inbox, title, area, body
- 2026-09-27T11:59:05Z · status inbox→ready
- 2026-09-27T12:12:14Z · status ready→active, branch
- 2026-09-27T12:16:54Z · status active→review
- 2026-09-27T13:29:07Z · status review→done, release:success
