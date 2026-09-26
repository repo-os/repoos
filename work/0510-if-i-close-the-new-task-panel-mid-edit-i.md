---
id: "0510"
title: Retain screenshots when closing the new task panel and unify screenshot entry
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-26T03:15:14Z"
updated_at: "2026-09-26T03:15:28Z"
---
## Problem

Closing the "new task" panel mid-edit currently preserves the freeform text
typed into the description field, so work is not lost when the user comes back
and reopens the panel. The screenshots they had attached, however, are
discarded on close and have to be re-captured or re-selected. That is
inconsistent: text survives, images do not.

The two places screenshots are entered are also inconsistent with each other:

- The "new input" drawer's screenshot button carries extra label text that the
  "new task" drawer's does not.
- The "new input" drawer's screenshot button sits at a different vertical
  position than the one on "new task".

Two entry points for the same concept (screenshots on an item) should look and
behave the same, and the partial-draft persistence should apply uniformly to
all of the drawer's draft state.

## Desired UX

- If the user closes the "new task" panel without submitting, the screenshots
  they attached come back when they reopen it, just like the text does.
  Screenshots are removed only when the user explicitly clicks the "clear"
  button — never as a side effect of closing, cancelling, or switching views.
- The screenshot button in the "new input" drawer uses the same minimal label as
  the one in the "new task" drawer, and is placed at the same top position, so
  both drawers read identically.

## Acceptance criteria

- [ ] Closing the "new task" panel without submitting preserves the draft
      text, and the draft screenshots, and reopening the panel restores both.
- [ ] Clicking the "clear" button in the "new task" panel still discards the
      draft text and the draft screenshots together, as it does today.
- [ ] Screenshots are never removed by closing or dismissing the panel, nor by
      any other action short of the explicit "clear" button (or a successful
      submit).
- [ ] The "new input" drawer's screenshot button label matches the minimal
      label used by the "new task" drawer's screenshot button (no additional
      text on the "new input" button).
- [ ] The "new input" drawer's screenshot button is moved to the same top
      position in the form that the "new task" drawer's screenshot button
      occupies.
- [ ] Existing screenshot attach, preview, and submit behaviour in both drawers
      is unchanged apart from the label and placement above.
- [ ] `repoos check` passes.

## Notes for AI

- The draft-presistence change is about *state retention on close*, not about
  new storage. Reuse whatever mechanism already keeps the freeform text alive
  across a close/reopen cycle of the "new task" panel, and make the screenshot
  list follow the same lifecycle rather than inventing a second persistence
  path.
- Treat "clear" as the only implicit-free path. Check the close, cancel, and
  any panel-reset handlers (including navigation away and route change) for
  screenshot-list resets and remove only those resets, keeping the text field's
  existing behaviour exactly as-is.
- Both drawers use the shared dialog components and the global form classes in
  `src/ui-app/src/style.css` (`field`, `btn-row`, `ff-*`, `shot-dropzone`, …).
  Extend `style.css` if a variant is missing rather than adding bespoke styling
  in a component's `<style scoped>` block.
- Screenshots upload into `work/.attachments/` / `inputs/.attachments/`, which
  are gitignored. Do not commit image binaries under `work/` or `inputs/`.
- Assume a retained screenshot is the already-uploaded attachment plus a small
  persisted reference (id or path) sufficient to re-render its thumbnail after
  a reopen; do not re-upload or re-read the file from disk eagerly.
- If the draft is retained per-drawer rather than globally, the "new input"
  draft should not inherit "new task" draft screenshots — keep the two drawers'
  draft state separate while making the *component* shared.

## Scope

In scope:

- Retaining draft screenshots across close/reopen of the "new task" panel.
- Normalising the "new input" screenshot button's label to the "new task"
  minimal label and moving it to the top position.

Deferred:

- Extending draft retention to other drawer fields or other drawers (e.g. new
  story, new input) beyond the screenshot button's label/placement.
- Any change to the screenshot upload pipeline, storage, or the task/input
  submission flow.

## Related

- `AGENTS.md` — drawer/form component conventions and the task-asset guard.
- `user-docs/` — any documented behaviour of the new task / new input drawers
  that this change contradicts.

## Original prompt

If I close the new task panel mid-edit it currently keeps the text in the freeform text area so I can finish when I come back, but it loses the screenshots. Let's make it so the screenshots are retained as well as the text (you should only clear them if the user clicks the "clear" button) also please make the screenshot entry the same between "new task" and "new input". keep the minimal text on the screenshot button of "new input" and use that for "new task" screenshot button, but move the screenshot button to the top position on the "new input" so it matches where it is on "new task"

## Screenshots

![Screenshot-2026-09-26-at-11.13.32](/api/tasks/0510/attachments/screenshot-1.png)
![Screenshot-2026-09-26-at-11.13.49](/api/tasks/0510/attachments/screenshot-2.png)

## Activity

- 2026-09-26T03:15:14Z · created · hello@repoos.org
- 2026-09-26T03:15:14Z · screenshots
- 2026-09-26T03:15:15Z · screenshots
- 2026-09-26T03:15:28Z · status draft→inbox, title, area, type, body
