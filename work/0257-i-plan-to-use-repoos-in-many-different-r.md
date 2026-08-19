---
id: "0257"
title: Make repo name pill clickable with customizable pastel background color
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/make-repo-name-pill-clickable-with-custo
model_override: default
pm_model_override: default
created_at: "2026-08-19T17:27:44Z"
updated_at: "2026-08-19T17:48:27Z"
---
## Problem

When using RepoOS across many different repos, it is hard to visually distinguish
them at a glance — the only indicator is the repo name text in the upper-left
corner pill. There is no way to colour-code repos so you can instantly recognise
which one you are in.

## Desired UX

The repo-name pill in the top bar becomes clickable. Clicking it opens a small
popover/dropdown showing a palette of ~12 pastel colours arranged in a row or
grid. Selecting a colour sets that colour as the pill's background (with
sufficient contrast so the text remains legible in both light and dark modes).
Selecting the same colour again (or a dedicated "default/none" swatch) removes
the custom colour and reverts to the current default appearance.

The chosen colour is stored in `localStorage` under a key scoped to the current
repo name (e.g. `repoos.repoColor.<repoName>`), so:

- Each browser user picks their own colour independently — no server-side
  storage, no network round-trip, no cross-device sync.
- Different repos can have different colours in the same browser.
- Opening a repo that has never been customised shows the default uncoloured
  pill (current appearance).

If a user never clicks the pill or never picks a colour, the pill looks exactly
as it does today — zero change to the default state.

## Acceptance criteria

- [ ] The repo-name pill in `TopBar.vue` is rendered as a `<button>` (or has a
  click handler) and shows a pointer cursor on hover.
- [ ] Clicking the pill opens a small popover/dropdown positioned below it with
  ~12 pastel colour swatches plus an option to clear/reset to default.
- [ ] Clicking a swatch applies that colour as the pill's `background-color`
  immediately and closes the popover.
- [ ] Clicking "default" (or the same swatch again) removes the custom colour
  and reverts to the current default appearance.
- [ ] The colour is persisted to `localStorage` with the key pattern
  `repoos.repoColor.<repoName>` (the repo name is the last path segment from
  `health.root`, matching how `repoName` is already computed).
- [ ] On page load, the stored colour (if any) is read from `localStorage` and
  applied to the pill before/alongside first render — no flash of unstyled pill.
- [ ] The text colour in the pill remains legible on all 12 pastel backgrounds
  in both light and dark mode (pick the text colour automatically based on
  background luminance, or use a light-on-dark / dark-on-light rule).
- [ ] The popover closes when clicking outside it (click-away dismiss).
- [ ] No network calls are made when opening the popover, selecting a colour, or
  loading a saved colour.
- [ ] `repoos check` passes.

## Notes for AI

- **Where to touch:**
  - `src/ui-app/src/components/TopBar.vue` — make the `.repo-pill` a clickable
    element, add the popover/template and the colour-read/write logic.
  - `src/ui-app/src/components/TopBar.vue` (style section) — add styles for
    the popover, swatch buttons, and the dynamic background/text colours on the
    pill.
  - No server-side changes. No changes to `src/stores/repo.ts` or
    `src/stores/config.ts` — this is a self-contained local UI feature.

- **localStorage key convention:** Follow the existing `repoos.*` key pattern
  already used for `repoos.board.sortOrder`, `repoos.newVersion`, etc. The repo
  name segment is derived from `repoName` (already a computed in the repo store
  at `stores/repo.ts:303`). Sanitise it for use as a key (e.g. lowercase,
  replace `/` with `-`).

- **Pastel palette:** Pick 12 colours that are recognisable in both light and
  dark themes. Avoid colours too close to the existing theme accent colours
  (`--cyan`, `--violet`). Each swatch should be a ~20px circle. Use CSS custom
  properties for the colours so they're easy to adjust later.

- **Popover positioning:** Keep it simple — absolute-positioned below the pill.
  No need for a floating-ui library; CSS + a fixed max-width is fine. Make sure
  it doesn't overflow the viewport on small screens.

- **Do NOT:**
  - Store anything server-side or add an API endpoint.
  - Change the default appearance of the pill when no colour is selected.
  - Add a runtime dependency for the colour picker.
  - Touch any other component besides `TopBar.vue` unless strictly necessary.
  - Refactor unrelated TopBar code.

- **Assumption:** The user said "a dozen pastel colours" — 12 is a reasonable
  interpretation. The exact palette is up to the implementer but should feel
  cohesive (all pastel, similar saturation).

## Scope

This task covers only the colour-coding of the repo name pill in the top bar. It
does not cover:
- Colour-coding other places where `repoName` appears (dashboard subtitle,
  login badge) — those could be follow-ups.
- Syncing the colour across devices or user accounts.
- A settings page UI for managing repo colours (localStorage-only is sufficient
  for now).

## Original prompt

I plan to use RepoOS in many different repos and it will be hard to tell them apart since the main indicator is the repo name in the upper left corner. let's make the repo name clickable so you can choose from a range of a dozen pastel colors which will change the background color of that repo name button (and store this preference in local storage so every user can set their own color if they want), if the user decides not to customise their repo color that's fine too, the current default is ok as it matches the themes

## Activity

- 2026-08-19T17:30:04Z · status draft→inbox, title, body
- 2026-08-19T17:31:00Z · pm_model_override
- 2026-08-20T00:00:00Z · title, area, body corrected (previous PM write corrupted the file with a nested frontmatter block)
- 2026-08-19T17:47:23Z · model_override
- 2026-08-19T17:48:11Z · status inbox→ready
- 2026-08-19T17:48:27Z · status ready→active, branch
