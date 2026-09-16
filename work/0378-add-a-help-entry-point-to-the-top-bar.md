---
id: "0378"
title: "Add Help (\"?\") entry point to the top bar"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-help-entry-point-to-the-top-bar
created_at: "2026-09-16T17:09:45Z"
updated_at: "2026-09-16T17:13:33Z"
---
## Problem

Early users have nowhere to go when they get stuck. There is no "Help"
affordance anywhere in the app today — no link to docs, no way to ask a
question, and no obvious pointer to where bugs should be filed. Users either
give up or open issues in the wrong place.

## Desired UX

A small "?" icon/button lives in the top bar and is visible on **every**
screen (it is part of the header, not a route). Clicking it opens a
lightweight dropdown/popover containing 2–3 plain links:

- **Docs** — points at `user-docs/` wherever those are published
- **GitHub Discussions** — for questions
- **GitHub Issues** — for bug reports

The icon matches the existing nav icon style: inline SVG, `currentColor`,
`1.8` stroke-width. Dismissing the menu (click outside / Escape) closes it
without navigating.

## Acceptance criteria

- [ ] A "?" icon button renders in the top bar on every screen/route.
- [ ] Clicking it opens a dropdown/popover with links to Docs, GitHub
      Discussions, and GitHub Issues.
- [ ] Icon uses inline SVG with `currentColor` and `1.8` stroke-width,
      consistent with the icons in `nav.ts`.
- [ ] The control is NOT added as an entry in `nav.ts` / the main
      Control/Inputs/Work/Agents/Context/Settings nav.
- [ ] External links (Discussions, Issues, and Docs if hosted externally)
      open in a new tab with `rel="noopener noreferrer"`.
- [ ] Menu closes on click-outside and on Escape.
- [ ] Follows existing top-bar/header component conventions; no new runtime
      dependency added.
- [ ] UI rebuilt (`bun run build:ui` or `bun run build`) after the change.

## Notes for AI

- This lives in the **top-bar/header component**, separate from `nav.ts`.
  Find the header via the UI layout in `src/ui-app/` — do not extend the nav
  list.
- Reuse the existing icon rendering style from `src/ui-app/src/nav.ts`
  (inline SVG, `currentColor`, `1.8` stroke-width) for visual consistency.
- Dialog/popover styling is body-teleported, so its CSS belongs in
  `src/ui-app/src/style.css`, not a scoped view block — verify whether the
  chosen dropdown implementation follows that pattern.
- **Assumed URLs** (the explanation did not pin exact links; adjust if the
  repo's actual URLs differ):
  - Discussions: `https://github.com/repo-os/repoos/discussions`
  - Issues: `https://github.com/repo-os/repoos/issues`
- **Assumption — Docs link:** the explanation says "user-docs/, wherever
  they're published" and does not name the published URL. Default to the
  repo's published docs base URL if one is configured; otherwise point at the
  `user-docs/` path in the repo and leave a single obvious constant to change
  later. Do not hardcode multiple fallbacks.
- Keep the menu minimal — 2–3 links only. Do not add search, onboarding, or a
  help center.
- Zero runtime dependencies is a hard constraint; build the dropdown from
  existing components/patterns.

## Scope

**In scope (v1):** the top-bar "?" affordance and its small link menu as
described above.

**Deferred:** an in-app help center, contextual help, docs search, embedded
docs rendering, and any docs-hosting changes.

## Related

- `user-docs/` — destination for the Docs link.
- `src/ui-app/src/nav.ts` — source of the icon style convention (not a place
  to add this entry).

## Original prompt

Add a Help ("?") entry point to the top bar

Early users have nowhere to go when they're stuck — no "Help" affordance exists in the app today. Add a small "?" icon/button to the top bar (visible on every screen, not just a nav item) that opens a lightweight menu linking to:

Docs (user-docs/, wherever they're published)
GitHub Discussions (now enabled on repo-os/repoos) — for questions
GitHub Issues (now enabled) — for bugs

Keep it minimal for v1: a small dropdown/popover with 2-3 links, no in-app help center. Should follow the existing icon style used in nav.ts (inline SVG, currentColor, 1.8 stroke-width). Not a nav.ts entry — this lives in the top bar/header component, separate from the main Control/Inputs/Work/Agents/Context/Settings nav so it doesn't compete for space there.

## Activity

- 2026-09-16T17:09:45Z · created · hello@repoos.org
- 2026-09-16T17:09:58Z · status draft→inbox, title, area, body
- 2026-09-16T17:10:20Z · status inbox→ready
- 2026-09-16T17:10:27Z · status ready→active, branch
- 2026-09-16T17:13:33Z · status active→review
