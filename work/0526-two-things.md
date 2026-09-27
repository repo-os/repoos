---
id: "0526"
title: Cap theme switcher at 3 and move themes to top of General settings
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-27T00:58:08Z"
updated_at: "2026-09-27T00:58:19Z"
---
## Problem

The theme switcher in the bottom-left of the app shows every available theme.
With more than a handful of themes registered it overflows its corner and
doesn't fit, so the control becomes unusable. Separately, themes live somewhere
inside General settings rather than at the top, which makes the most frequently
tweaked appearance setting the hardest one to find.

## Desired UX

- The bottom-left theme switcher shows at most 3 themes, and always fits.
- The 3 shown are the user's favorited themes, in favorited order.
- On a brand-new setup where the user has favorited nothing yet, the switcher
  falls back to the first 3 themes from the normal theme list.
- General settings opens with themes as the first (top) section, ahead of the
  other general preferences.

## Acceptance criteria

- [ ] The bottom-left theme switcher renders no more than 3 themes.
- [ ] Favorited themes take priority; when the user has 1–3 favorites, exactly
      those are shown in favorite order.
- [ ] When the user has more than 3 favorites, only the first 3 (in favorite
      order) are shown.
- [ ] When the user has no favorites, the first 3 themes in the existing theme
      list order are shown.
- [ ] The cap applies on every render path (initial load, theme data refresh,
      and after favoriting/unfavoriting a theme) — not only on first paint.
- [ ] The switcher itself still fits within the bottom-left corner at the cap of
      3, with no overflow or clipping.
- [ ] Clicking a theme in the switcher still applies it.
- [ ] In General settings, the themes section is rendered first, above the other
      general preferences.
- [ ] Favoriting/unfavoriting a theme from the settings section is still
      possible, and the change is reflected in the switcher without a reload.
- [ ] Existing favorites are not dropped, reordered, or truncated in storage —
      the cap is presentational only.
- [ ] The 3-theme cap works in both light and dark appearance, and on narrow
      viewports.

## Notes for AI

- Assumption: the cap is presentational. Do not truncate or rewrite the user's
  saved favorites; only limit how many are surfaced in the switcher.
- Assumption: "first 3 themes" means the first 3 in whatever order the existing
  theme list already produces (the same order the full list/settings section
  uses). Do not introduce a new sort or a separate "default themes" concept.
- Assumption: "top of the general settings" means the themes block is the first
  rendered section of the General settings view, before every other preference
  group. Keep the themes section's own contents and behavior as they are.
- Favorites are the source of truth for the switcher's contents. If the favorites
  mechanism does not yet exist in the bottom-left switcher, check the settings
  section and existing favorites data first and wire to that rather than adding a
  second, parallel notion of "favorited".
- Keep the cap in one place (a single helper/constant such as `MAX_VISIBLE_THEMES`)
  rather than sprinkling the literal `3` across components, so the limit is
  changeable in future.
- The switcher is an existing component; do not redesign its styling beyond what
  is needed to make 3 entries fit. If the component already handles variable
  counts gracefully, leave the visual design alone.
- Do not remove or collapse the full theme list in General settings — users must
  still be able to see and favorite any registered theme there; only the
  bottom-left switcher is capped.
- Follow the repo conventions in `AGENTS.md`: no runtime dependencies, TypeScript
  with `.js` import extensions, and the shared dialog/form classes for any new UI
  (none should be needed here).

## Scope

- Covers: the bottom-left theme switcher's visible theme count, and the position
  of the themes section within General settings.
- Deferred: any change to what favoriting means or where favorites are stored,
  theming of the settings page as a whole, and any search/filter UI for long
  theme lists.

## Original prompt

Two things:
- only ever show 3 themes in the bottom left theme switcher, because more than that and it won't fit (so if it's a new setup and the user hasn't favorited any yet just take the first 3)
- put the themes at the top of the general settings.

## Screenshots

![Screenshot-2026-09-27-at-00.35.47](/api/tasks/0526/attachments/screenshot-1.png)
![Screenshot-2026-09-27-at-00.35.32](/api/tasks/0526/attachments/screenshot-2.png)

## Activity

- 2026-09-27T00:58:08Z · created · hello@repoos.org
- 2026-09-27T00:58:09Z · screenshots
- 2026-09-27T00:58:09Z · screenshots
- 2026-09-27T00:58:19Z · status draft→inbox, title, area, body
