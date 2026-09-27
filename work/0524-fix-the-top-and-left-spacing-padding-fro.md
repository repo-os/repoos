---
id: "0524"
title: Fix History tab padding on top and left edges
type: bug
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-history-tab-padding-on-top-and-left-
created_at: "2026-09-27T00:57:51Z"
updated_at: "2026-09-27T02:35:32Z"
---
## Problem

The History tab on `/repo` renders the commit timeline inside a
`Card`, but the panel supplies almost no inset of its own, so its content sits
flush against the card's rounded border on the top and left. Concretely, in
`src/ui-app/src/components/RepoHistoryPanel.vue`:

- `.hist-toolbar` has `padding: 4px 4px 14px` — a 4px top and left inset.
- `.hist-rail` has `padding: 0 8px 24px 4px` — a 4px left inset, zero on top.
- `Card` (`src/ui-app/src/components/ui/card.vue`) contributes only
  `rounded-[15px] border bg-[var(--panel)]` — no padding at all.

The result reads as broken/bleeding rather than intentionally flush: the day
headers, the timeline rail and the first commit row crowd the card edge, and
the visual inset does not match the other three tabs (Docs / Skills /
Discover), which are laid out with the same `Card` component and look
comfortably inset. It makes the newest tab look unfinished at a glance.

## Desired UX

Open **Repo Context → History** and the timeline sits inside its card with
clear, deliberate breathing room on the top and left — the toolbar, day
headers and commit rows are all inset from the card border by the same
comfortable amount, and that inset visually matches the neighbouring tabs.
The timeline's vertical rail, its dots and the day-header ticks stay aligned
with each other, and the sticky day headers still stick flush to the top of
the scroll area with no gap or content peeking around them.

## Acceptance criteria

- [ ] The History tab's content is inset from the top edge of its card by
      roughly 12–16px, and from the left edge by roughly 12–16px — pick one
      value and apply it consistently, rather than leaving the current 4px /
      0px mix.
- [ ] Both the toolbar (`.hist-toolbar`) and the scrolling commit list
      (`.hist-rail`) share that same top/left inset, so switching between
      them does not visibly jump the content sideways.
- [ ] Right and bottom spacing are unchanged in character — the fix is
      about the top and left edges only.
- [ ] The timeline geometry still holds: the vertical rail
      (`.hist-commit::before`, `left: 10px`), the day ticks (`.hist-tick`,
      `margin-left: 6px`) and the row dots/avatars remain aligned with one
      another and with the day headers after the inset changes.
- [ ] Sticky day headers (`.hist-day-head`, `position: sticky; top: 0`) still
      stick flush to the top of the scroll container, with no content
      scrolling visibly behind/above them and no translucent gap.
- [ ] The loading, empty, error and "End of history" states
      (`.hist-state`, `.hist-more`) are inset consistently with the commit
      rows, and none of them sit flush against the card edge.
- [ ] The other three tabs (Docs, Skills, Discover) are visually unchanged.
- [ ] Works at narrow widths too — the toolbar's existing `flex-wrap` and
      `min-width: 160px` on `.hist-field-grow` behaviour are preserved and
      the new inset does not cause the toolbar to wrap earlier than before.
- [ ] `bun run build:ui` (or `bun run build`) is run so the worktree build is
      fresh, and `repoos check` passes (including `oxfmt --check`/`oxlint`).

## Notes for AI

- **Primary files:** `src/ui-app/src/components/RepoHistoryPanel.vue` (the
  `<style scoped>` block — `.hist`, `.hist-toolbar`, `.hist-rail`,
  `.hist-state`, `.hist-more`, `.hist-day-head`) and, if you need to adjust
  the container, `src/ui-app/src/views/ContextView.vue` (`.hist-wrap`,
  `.hist-card`).
- **Assumption (stated because the report is vague):** the intended fix is
  padding *inside the card*, matching the inset the other tabs get — not
  moving the card itself, and not changing the page-level layout. If a
  different approach is clearly better, do it and say so in the task.
- **Assumption:** apply the change in `RepoHistoryPanel.vue` so the panel owns
  its own spacing rather than being coupled to a single call site. The panel
  is currently rendered only from `ContextView.vue` (one call site today), so
  either file works; just keep the result correct if that changes.
- **Assumption:** "the sides" means the inset between the content and the
  card's edges, not the gap between the page title/tabs and the card. Do not
  touch `.ctx-page`, `.ctx-tabs` or the page header spacing.
- Use the existing CSS custom properties (`--panel`, `--border`, `--txt-*`)
  if any new colour is needed; do not hardcode hex values.
- Scoped class rules are fine — `repoos check`'s CSS-layering guard only
  flags **unlayered bare-element/universal selectors** (`*`, `div`, etc.), so
  adding padding to a class selector will not trip it. Do not introduce
  `*{}` or tag-selector rules anywhere.
- Run `bun run fmt` before committing on the task branch; the pre-commit hook
  skips task branches and `oxfmt --check` is the first thing the close-out
  gate runs.
- This is cosmetic and scoped. Do not refactor the timeline component, rename
  classes, or start tidying unrelated spacing while you are in the file.
- Do not request a preview automatically (see `AGENTS.md` — previews are
  human-initiated). If the human asks for browser verification, emit
  `::repoos-preview-request::`.

## Scope

In scope: the top and left padding/spacing of the History tab's content
within its card, including the toolbar, commit rail, and the state/empty
messages.

Out of scope: any change to the commit data, filtering, path/branch
selectors, diff navigation, loading or pagination behaviour; any change to
the Docs, Skills or Discover tabs; any shared change to `card.vue` that would
alter other views' layouts.

## Related

- `AGENTS.md` — UI conventions (dialogs/forms live in `src/ui-app/src/style.css`;
  overlays must be teleported), the definition of done, and
  `docs/debugging-check-failures.md` if `repoos check` fails for reasons you
  cannot explain.
- The History tab itself was added as part of the git-history panel work in
  `src/ui-app/src/components/RepoHistoryPanel.vue` (currently the only
  consumer is `ContextView.vue`).

## Original prompt

Fix the top and left spacing/padding from the sides of the new git history tab.

## Screenshots

![Screenshot-2026-09-27-at-00.11.36](/api/tasks/0524/attachments/screenshot-1.png)

## Activity

- 2026-09-27T00:57:51Z · created · hello@repoos.org
- 2026-09-27T00:57:52Z · screenshots
- 2026-09-27T00:58:38Z · status draft→inbox, title, area, type, body
- 2026-09-27T00:58:43Z · status inbox→ready
- 2026-09-27T01:07:13Z · status ready→active, branch
- 2026-09-27T01:08:31Z · status active→review
- 2026-09-27T02:35:32Z · status review→done, release:success
