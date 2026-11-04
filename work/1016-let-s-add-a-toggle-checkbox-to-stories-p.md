---
id: 1016
title: "Add \"Hide Completed Stories\" toggle to Stories page"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: pi
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-11-03T09:13:40Z"
updated_at: "2026-11-04T04:23:01Z"
---
## Problem

The Stories page lists all stories regardless of state, so completed stories
clutter the view. When the list is long, in-progress and pending work gets
buried under items that are already done, making it harder to see what's left
to do.

## Desired UX

On the Stories page, the user sees a toggle/checkbox labeled "Hide Completed
Stories". When checked, completed stories disappear from the list; when
unchecked, the full list shows again. The toggle is visible and self-explanatory
at the top of the stories list, and toggling it updates the list immediately
without a page reload.

## Acceptance criteria

- [ ] The Stories page shows a toggle/checkbox labeled "Hide Completed Stories"
- [ ] Checking it removes completed stories from the visible list
- [ ] Unchecking it restores the full list, including completed stories
- [ ] The list updates immediately on toggle, without a full page reload
- [ ] The default state (checked or unchecked) is chosen and documented in the implementation
- [ ] Existing story-list behavior (ordering, other filters) is unchanged when the toggle is off

## Notes for AI

- The Stories page lives in the web UI (`src/ui-app`); find the view via
`src/ui-app/src/router.ts` and the nav entries in `src/ui-app/src/nav.ts`.
- Follow existing UI conventions: use the styled checkbox/toggle pattern already
in the app, not a raw unstyled input, and keep styling consistent with other
list-filter controls on the page.
- Assumption: "completed" means the story's existing done/complete status field
— use whatever state the stories data model already tracks; do not invent a
new status.
- Assumption: the toggle's state does not need to persist across sessions unless
persistence is trivial with an existing pattern; default to unchecked (show
everything) on first load if no persistence is added.
- Do not change story status values or the data model — this is a view-level
filter only.

## Scope

Covers only the Stories page filter toggle. Deferred: similar hide-completed
filters on other pages (board, tasks), saved filter presets, or server-side
filtering — the filter can be applied client-side.

## Original prompt

Let's add a toggle/checkbox to Stories page to "Hide Completed Stories"

## Activity

- 2026-11-03T09:13:40Z · created · hello@repoos.org
- 2026-11-03T09:14:09Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-11-04T04:22:41Z · status inbox→ready
- 2026-11-04T04:22:46Z · cli_override
- 2026-11-04T04:23:01Z · model_override
