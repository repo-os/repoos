---
id: "0951"
title: "Use the full window height on every page: content scrolls down to the bottom edge, with a fade-out where floating controls need to stay visible"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-24T22:51:41Z"
updated_at: "2026-10-24T22:52:12Z"
---
## Problem

On most pages the main content area stops short of the bottom of the window. The left sidebar runs all the way down, but the page content is cut off by a hard edge well above the window bottom, leaving a band of empty background (see Work, Stories, Checks, Releases, Deployments, Agents, Context and Settings: cards are clipped mid-way at a line, with unused space beneath). This wastes vertical space and looks like a layout bug. `.main` in `src/ui-app/src/style.css` is `flex: 1; overflow-y: auto; padding: 22px 26px 60px`, so find which ancestor or sibling is limiting its height (shell height calc, a reserved bottom bar, the integration-pipeline pill on Work, the floating agent heads) rather than assuming.

## Desired UX

Every standard nav page uses the full window height: the scrollable content area extends to the bottom edge, like the sidebar does. Content scrolls under the bottom edge. Where something must stay visible and clickable at the bottom (the Work page's "Human / Archived" and integration-pipeline controls, the floating agent heads), keep it floating on top and give the area behind it a subtle fade-out or blur so text underneath stays readable and the controls stay easy to see and hit. There must be enough end-of-scroll padding that the last card is never hidden behind a floating control. No visible cut line or empty band anywhere.

## Acceptance criteria

- [ ] On Control, Inputs, Work, Stories, Checks, Releases, Deployments, Dev, Secrets, Agents, Context and Settings the scrollable page area reaches the bottom of the window (verify at two or three window heights), with no empty band or hard clip line beneath the content.
- [ ] The last item on every page can be scrolled fully into view and is not covered by a floating control.
- [ ] Work page: the bottom controls stay visible and clickable, with a fade or blur behind them; no content is unreachable.
- [ ] The floating agent heads do not cover essential controls (check the bottom right on every page); keep their position or add a safe inset.
- [ ] One shared mechanism (a CSS variable or utility for the bottom fade and bottom inset), not per-page hacks; works in all themes and light/dark, passes the contrast audit and `hardcoded-colors` guard (use theme tokens).
- [ ] Mobile or narrow widths still work, and pages that are intentionally centered or narrow (login/auth, modals) are unchanged.
- [ ] Declare `## Shots` for at least Work, Stories and Checks at a tall and a short viewport, and look at them yourself.
- [ ] Update tests and any docs that describe the layout; follow the AGENTS.md "pages use the full main width" convention.

## Notes for AI

- Check how this interacts with #0949 (page scrolling, which pinned headers) and with #0950 (skeleton loaders; it edits the same view files and style.css, so keep your edits small and merge main often).
- Do not add runtime dependencies.

## Activity

- 2026-10-24T22:51:41Z · created · njachowski@gmail.com
- 2026-10-24T22:52:12Z · status inbox→ready
