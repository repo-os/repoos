---
id: "0581"
title: "User docs: prefer curl install, top bar and mobile menu fixes"
type: feature
status: done
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/user-docs-prefer-curl-install-top-bar-an
model_override: opencode-go/mimo-v2.6-flash
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-29T09:55:42Z"
updated_at: "2026-09-29T11:09:49Z"
---
## Goal

Small polish pass on the user docs site (`user-docs/`, VitePress): steer people
to the curl install, and fix several top bar / mobile navigation problems.

## 1. Install page: mark curl as preferred

In `user-docs/getting-started.md`:

- Rename the heading `curl — standalone build` to `curl — preferred`. Every
  install method needs Bun or Node >= 20.6 on PATH, so "standalone" is
  misleading; do not add a runtime warning to the curl entry alone.
- Under it, add key facts, visible without hovering (hover popups don't work on
  touch): curl is the easiest to update and uninstall (`repoos upgrade`,
  `repoos uninstall`) and the only method with the `--channel beta|rc|canary`
  options. Use a VitePress `::: tip` block or a `<details>` disclosure, not a
  custom tooltip component.
- Keep the "Updating RepoOS" table as is. Check `user-docs/index.md` (has its
  own install snippets) and the "On this page" outline still read correctly
  after the heading rename, and fix any anchor links to the old heading.

## 2. Desktop top bar

- The small vertical divider currently sits between the `repoos.org` link and
  the GitHub icon. Move it so it sits between the GitHub icon and the theme
  dropdown.
- The top bar background stops before the right edge on wide screens, and the
  colour at the top right differs from the rest of the bar. Make the bar's
  colouring extend the full viewport width, uniformly, in every theme
  (check Gruvbox light and dark at least).

## 3. Medium-width responsiveness

On medium-width windows the top bar is cut off (nav items, `repoos.org`, GitHub
icon and theme controls overflow or clip). Fix the breakpoint behaviour so
nothing is clipped at any width: either everything fits, or it collapses to the
mobile menu earlier. Test at roughly 640, 768, 960 and 1024px.

## 4. Mobile menu redesign

Mirror the style and layout of the repoos.org mobile menu (the landing site in
`landing/`, e.g. its nav component), adapted to the docs nav:

- One left-aligned list of rows separated by thin dividers: Get started,
  Agents, CLI, Configuration, Environment & secrets, `repoos.org`, GitHub.
- GitHub is currently centred while everything else is left-aligned; make it a
  normal left-aligned row (icon + label).
- Theme row at the bottom with the label **Theme** (not "Design theme"), the
  label on the left and the theme dropdown + light/dark toggle on the right, as
  on repoos.org.

## Notes

- Docs-site styling only, plus the one page's copy. Look under
  `user-docs/.vitepress/` (theme, custom CSS, layout slots) for the top bar and
  mobile menu.
- Rebuild the docs (`user-docs` build) and check the result in a browser at
  desktop, tablet and phone widths in both a light and a dark theme.
- Per AGENTS.md, do not commit `user-docs/.vitepress/dist/`.

## Acceptance

- Heading reads "curl — preferred" with the key facts shown beneath it.
- Divider is between GitHub icon and theme dropdown; top bar colour is uniform
  edge to edge.
- No clipped top bar at any width; mobile menu matches the layout above.

## Activity

- 2026-09-29T09:55:42Z · created · unknown
- 2026-09-29T09:56:30Z · model_override
- 2026-09-29T09:56:40Z · review_model_override
- 2026-09-29T09:56:54Z · status inbox→ready
- 2026-09-29T09:56:58Z · status ready→active, branch
- 2026-09-29T10:54:29Z · status active→review
- 2026-09-29T11:09:49Z · status review→done, release:success
