---
id: "0536"
title: Add sort-by dropdown to stories page
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-sort-by-dropdown-to-stories-page
created_at: "2026-09-27T07:32:53Z"
updated_at: "2026-09-27T19:32:44Z"
---
## Problem

The work page already offers a sort-by dropdown, and the stories page has no
equivalent. Without it, users viewing a long list of stories have no control
over the ordering and are stuck with whatever order the list renders in — they
cannot group stories by status, or put the most recently touched work first.

## Desired UX

- The stories page shows a sort-by dropdown, styled and behaving the same way as
  the existing sort dropdown on the work page (same custom styled dropdown
  component, same placement/appearance, same persistence pattern if the work
  page has one).
- The available options are the work page's options **minus** the priority
  option, because stories have no priority level. That leaves three options.
- The stories page defaults to a "most recently updated" sort, so a fresh visit
  shows the stories that changed most recently at the top.
- Changing the selection re-orders the visible story list without a page
  reload, and the selection is reflected in the control immediately.

## Acceptance criteria

- [ ] The stories page renders a sort-by dropdown matching the work page's sort
      dropdown in style and interaction.
- [ ] Exactly three sort options are offered, matching the work page's
      non-priority options.
- [ ] No priority-based sort option appears on the stories page.
- [ ] The default sort is "most recently updated".
- [ ] Selecting an option re-orders the rendered story list accordingly.
- [ ] The dropdown uses the custom styled dropdown component, not a native
      `<select>`.
- [ ] Sorting is applied purely on the already-loaded story data — no new
      server endpoint or fetch is required.
- [ ] `repoos check` passes (format, lint, build, tests, UI smoke test).

## Notes for AI

- Find the existing work-page sort implementation and mirror it — the point of
  this task is consistency with that control, not a fresh design. Grep for the
  work view's sort state and its sort-key list to get the exact three remaining
  keys and the option labels; do not invent new labels or new sort keys.
- Assumption: the work page has four sort options, one of which is priority.
  If it turns out to have a different set, the rule still holds — drop
  priority, keep the rest, so the stories page has three.
- Assumption: "most recently updated" means the same field the work page's
  existing updated-at ordering uses (task/story `updated_at`). Reuse that field
  and its comparison rather than adding a new one.
- If the work page persists the chosen sort (e.g. in local storage or a store),
  mirror that too so the two pages behave the same way. Do not let stories write
  a key that collides with the work page's.
- Stories have no priority level — make sure no sort path dereferences a
  priority field on a story, since that would be `undefined` for every row.
- Extend existing tests if the work page's sort is covered; add coverage for the
  stories page's default sort and for the absence of the priority option.

## Scope

- In scope: the stories page sort dropdown, its three options, and the
  "most recently updated" default.
- Deferred: any change to the work page's own sort behaviour, new sort keys or
  filters, and any server-side sorting.

## Related

- Existing work-page sort control (same style being mirrored)
- AGENTS.md conventions: custom styled dropdowns, and shared form/drawer
  component usage

## Original prompt

Let's add a sort by dropdown to the stories page, do it in the same style as the sort on the work page. But stories don't have a priority level, so don't include that sort option, the other 3 are ok, and make the default sort order to be "most recently updated"

## Screenshots

![Screenshot-2026-09-27-at-15.31.31](/api/tasks/0536/attachments/screenshot-1.png)

## Activity

- 2026-09-27T07:32:53Z · created · hello@repoos.org
- 2026-09-27T07:32:54Z · screenshots
- 2026-09-27T07:33:05Z · status draft→inbox, title, area, body
- 2026-09-27T19:16:10Z · status inbox→ready
- 2026-09-27T19:16:46Z · status ready→active, branch
- 2026-09-27T19:32:44Z · status active→review
