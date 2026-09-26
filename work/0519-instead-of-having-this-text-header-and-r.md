---
id: "0519"
title: Render input panel text entries as click-to-edit cards with markdown
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-26T09:42:05Z"
updated_at: "2026-09-26T09:42:36Z"
---
## Problem

The Input panel (`inputs/`) shows each input's text as a raw, undifferentiated
block under a literal `"TEXT"` header, followed by the printed text. Unlike the
task spec panel, there is no card affordance: the text is not obviously
something you can act on, it does not look like a discrete object, and
clicking it does nothing. The result is that inputs read as a wall of printed
content rather than a list of editable records, and users have no cue that an
input can be opened and changed.

## Desired UX

- Each input renders as a card in the same visual idiom the task spec panel
  already uses, so the two panels feel like the same system.
- The card has **no title** — in particular, not the current literal `"TEXT"`
  header — and **no edit button**. The card itself is the affordance.
- Clicking anywhere on the card opens the existing input edit modal, so the
  user discovers editability by the modal popping up rather than by being told
  up front.
- Any markdown in the input's text is rendered inside the card (the same way
  the task spec panel renders markdown) instead of being shown as raw
  unformatted text.
- Multiple inputs in the panel each get their own card, in their existing
  order.

## Acceptance criteria

- [ ] The literal `"TEXT"` header above the input panel's text block is gone.
- [ ] Each input's text is rendered inside a card that visually matches the
      task spec panel's card treatment (border/background/spacing idiom).
- [ ] The card has no visible title and no edit/pencil button or other
      explicit "Edit" affordance.
- [ ] Clicking the card opens the same modal used to edit an input today.
- [ ] Markdown in the input text renders as markdown in the card (e.g.
      `**bold**`, links, lists, code spans) rather than as literal
      asterisks/brackets.
- [ ] Text with no markdown still renders cleanly, with whitespace and
      newlines preserved sensibly and no empty-card or raw-HTML artifacts.
- [ ] The existing create-input flow still works; newly created inputs appear
      as cards too.
- [ ] Inputs without text (empty body) render as a valid, clickable card
      rather than collapsing or disappearing.
- [ ] `repoos check` passes (format, lint, build, tests, UI smoke).

## Notes for AI

- Model this on the existing task spec card + edit-modal behaviour. Find the
  component that renders a task's spec (the card that opens the spec edit
  modal) and mirror its structure, styles and click handling for inputs,
  rather than inventing a new pattern.
- Reuse the existing input edit modal and the existing input update path — this
  is a presentation change to the Input panel, not a data-model change.
- Use whatever markdown renderer the spec card already uses; do not add a
  runtime dependency (zero runtime dependencies is a hard constraint).
- The click target should be the whole card. Keep the existing keyboard/ARIA
  expectations of the spec card (an interactive card should still be
  reachable and activatable by keyboard) — do not regress accessibility
  relative to the component being mirrored.
- If the Input panel currently distinguishes multiple kinds of input, only
  change the text kind's presentation; leave other kinds as they are.
- Do not rename or remove fields, do not change input storage, and do not
  touch the task spec panel's existing behaviour.
- Run `bun run fmt` before committing on the task branch, and rebuild
  (`bun run build:ui`) after the UI change.

## Scope

Covers: the Input panel's text presentation — card treatment, markdown
rendering, click-to-open-edit-modal, removal of the `"TEXT"` header and any
edit button.

Deferred: any change to how inputs are created, stored, or fetched; other
input kinds; the task spec panel.

## Related

- `AGENTS.md` conventions: dialog/modal content is body-teleported and its CSS
  lives in `src/ui-app/src/style.css`, not the view's `<style scoped>` block —
  new drawer/dialog markup must use the shared `ui/dialog/*` components and
  the global `field` / `btn-row` / `ff-*` form classes.
- The task spec card it should match: the spec rendering path in
  `src/ui-app/src/` (view + card component) — use it as the reference
  implementation.

## Original prompt

Instead of having this "TEXT" header and raw printed text on the Input panel, do it like the task spec, where it's in an obvious kind of card which when clicked opens the edit modal (also render any markdown in the text card (but don't title it text) -- i don't think it needs a title (text) or an edit button, user will just click on it and realise they can edit when the modal pops up)

## Screenshots

![Screenshot-2026-09-26-at-16.19.41](/api/tasks/0519/attachments/screenshot-1.png)
![Screenshot-2026-09-26-at-16.22.15](/api/tasks/0519/attachments/screenshot-2.png)

## Activity

- 2026-09-26T09:42:05Z · created · hello@repoos.org
- 2026-09-26T09:42:06Z · screenshots
- 2026-09-26T09:42:06Z · screenshots
- 2026-09-26T09:42:25Z · status draft→inbox, title, area, body
- 2026-09-26T09:42:36Z · status inbox→ready
