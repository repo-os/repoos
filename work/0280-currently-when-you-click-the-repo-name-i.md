---
id: "0280"
title: Add dark-mode pastel repo colors and dynamic favicon/pwa icon
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-dark-mode-pastel-repo-colors-and-dyn
created_at: "2026-08-24T17:01:54Z"
updated_at: "2026-08-24T20:03:19Z"
---
## Problem

When a user clicks the repo name, the UI shows 12 pastel colors to choose from for that repo. There is currently no dark-mode-friendly set of colors, so users who prefer dark pastels (or need higher contrast against dark backgrounds) have no appropriate option. Additionally, once a color is chosen there is no visual cue at the OS/tab level — the favicon and PWA icon stay identical across every repo — making it hard to tell at a glance which project you're on when multiple tabs or installed app windows are open.

## Desired UX

- Choosing a repo color offers 24 choices total: the existing 12 pastel colors plus 12 new dark-mode pastel colors.
- When a user picks a color, the favicon updates to reflect that color, and the PWA icon (used for the installed app / homescreen) updates to match.
- This gives an at-a-glance signal for which project is currently open in a tab or installed app.

## Acceptance criteria

- [ ] A set of 12 new dark-mode pastel colors is added alongside the existing 12 pastel colors in the color picker.
- [ ] The color picker (opened by clicking the repo name) offers all 24 colors.
- [ ] Selecting a color updates the favicon to the chosen color.
- [ ] Selecting a color updates the PWA app icon to the chosen color.
- [ ] The chosen color persists and the favicon/PWA icon reflect it on reload and across sessions.
- [ ] `repoos check` passes.

## Notes for AI

- The color set and picker live in `src/ui-app` (Vue 3 SFC UI). Locate the existing 12 pastel colors, which are presumably defined in a single module/component, and add the dark palette there rather than scattering colors.
- After any UI change, rebuild UI (`bun run build:ui`) and verify with the managed preview.
- Assumption: the "12 pastel colors" refers to the current complete set; the dark-mode set is to be designed to pair conceptually with the existing colors (same hues, darkened/shifted for dark backgrounds). Exact color values are not specified by the user; choose reasonable dark pastels.
- favicon and PWA icon generation likely involves an existing icon/asset pipeline in `src/ui-app`; reuse it rather than introducing new tooling.
- Zero runtime dependencies is a hard constraint — do not add a runtime dependency without explicit authorization (see AGENTS.md).

## Scope

- Covers: new dark pastel palette, and dynamic favicon + PWA icon reflecting the chosen repo color.
- Deferred: verifying whether browser caching of the favicon delays icon updates in practice — flag this as a potential blocker in the review, but do not implement cache-busting workarounds here unless required to pass acceptance.

## Related

- See AGENTS.md conventions for UI changes, build, and preview verification.

## Original prompt

Currently when you click the repo name it shows you 12 pastel colors you can choose from, I want to add 12 more, but dark-mode pastel colors. and when you choose a color I'd like the favicon and pwa icon to change also (this makes it easier for people to quickly tell what project they're on). let me know if there are any blockers to this in practice (e.g. browser caching the favicon etc)

## Activity

- 2026-08-24T17:02:20Z · status draft→inbox, title, area, body
- 2026-08-24T19:54:38Z · status inbox→ready
- 2026-08-24T19:54:51Z · status ready→active, branch
- 2026-08-24T20:03:19Z · status active→review
