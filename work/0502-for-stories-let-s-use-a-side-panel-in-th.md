---
updated_at: "2026-09-25T16:18:14Z"
review_passes: 1
id: "0502"
title: Add side panel with tabs for stories
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-side-panel-with-tabs-for-stories
cli_override: opencode
model_override: opencode-go/space-bunny-free
created_at: "2026-09-25T15:51:09Z"
---
## Problem

Stories currently have no expanded view. To read a story's full body, its
related tasks, or its other metadata, a user has to leave the stories list and
hunt for the information elsewhere. The stories view is therefore only good
for scanning; anything beyond a one-line glance requires extra navigation.

The task and input views already solve this exact problem with a side panel that
opens alongside the list. Stories have no equivalent, so the feature is
inconsistent across the board.

## Desired UX

- Clicking a story row opens a side panel for that story, in the same visual
  style and with the same open/close behaviour as the existing task and input
  side panels.
- The panel presents the story's expanded information as tabs, so related
  information sits in clearly separated, switchable sections rather than one
  long scroll.
- A tab shows the full story body, rendered as markdown, without truncation.
- A tab lists the tasks related to the story; each entry is clickable and
  navigates to that task (opening its own side panel/view).
- Any further metadata the story already has is exposed as its own tab, using
  the same tab styling rather than bespoke controls.
- Switching story rows swaps the panel contents in place, without closing and
  reopening the panel.

## Acceptance criteria

- [ ] Selecting a story in the stories view opens a side panel styled
      consistently with the existing task and input side panels.
- [ ] The panel's content is organised into tabs (at minimum: full story body,
      and related tasks), using the same tab component/styling used elsewhere in
      UI.
- [ ] The body tab renders the full, untruncated story body, including
      markdown formatting, with the same renderer used for the task panel body.
- [ ] The related-tasks tab lists the story's related tasks; each row is
      clickable and opens that task (reusing existing task navigation/panel
      behaviour, not a new code path).
- [ ] A story with no related tasks shows an empty state in that tab rather
      than a blank panel.
- [ ] Selecting a different story while the panel is open updates the panel's
      contents and the active tab resets to the first tab.
- [ ] The panel can be closed with the same affordance as the task/input
      panels (close button and, where the existing panels support it, Escape).
- [ ] The panel renders correctly on narrow viewports, matching the existing
      task/input panel's responsive behaviour.
- [ ] Keyboard and focus behaviour match the existing task/input side panels
      (focus moves into the panel on open and returns sensibly on close).

## Notes for AI

- Reuse the existing side panel and tab components rather than building new
  ones. Read the task and input side panel implementations first and match
  their structure, CSS classes, and state handling. Any `position: fixed` or
  fullscreen overlay must be wrapped in `<Teleport to="body">` (or a Radix
  `DialogPortal`) per `AGENTS.md`.
- New dialogs/panels use the shared dialog components in `ui/dialog/*` and the
  global form/panel classes in `src/ui-app/src/style.css` instead of bespoke
  styling in a `<style scoped>` block. Extend `style.css` when a variant is
  missing.
- Any new tab strip must be a reusable component if the existing tab UI is not
  already generic enough for this use; do not add a second, near-duplicate tab
  implementation.
- Stories live in the stories view — find it via `src/ui-app/src/router.ts` and
  `src/ui-app/src/views/*View.vue`. Story/related-task relationships already
  exist in the data model and API; consume them, and do not invent a new
  relationship or endpoint unless none exists (if none exists, say so in a
  comment rather than widening the API).
- Zero runtime dependencies is a hard constraint — no new runtime deps.
- Rebuild the UI after changes (`bun run build:ui`) so the worktree build is
  fresh. Do not request a preview; previews are on demand from the human.
- Add tests covering: panel opens on story selection, tab switching, empty
  related-tasks state, and panel contents swapping when a second story is
  selected.

## Scope

**In scope:** the stories side panel and its tabbed layout, the story body
tab, the related-tasks tab, and any other tab purely displaying data the story
already has.

**Deferred:** editing story content from within the panel (this is a read-only
expanded view), reordering or filtering stories from the panel, and any
restructuring of the task/input side panels beyond what's needed to share a
component cleanly.

## Related

- The existing task and input side panels, which are the style reference for
  this work.

## Original prompt

For stories let's use a side panel in the same style as the task/input side panel to show the expanded info related to each store (e.g. tabs for full story body, related tasks etc).

## Activity

- 2026-09-25T15:51:09Z · created · hello@repoos.org
- 2026-09-25T15:51:22Z · status draft→inbox, title, area, body
- 2026-09-25T15:53:25Z · cli_override, model_override
- 2026-09-25T15:53:28Z · model_override
- 2026-09-25T15:55:05Z · model_override
- 2026-09-25T15:55:09Z · status inbox→ready
- 2026-09-25T15:55:11Z · status ready→active, branch
- 2026-09-25T16:14:40Z · status active→review

