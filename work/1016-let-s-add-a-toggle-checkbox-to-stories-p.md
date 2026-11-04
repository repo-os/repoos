---
id: 1016
title: "Add \"Hide Completed Stories\" toggle to Stories page"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-hide-completed-stories-toggle-to-sto
cli_override: pi
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-11-03T09:13:40Z"
updated_at: "2026-11-04T08:27:50Z"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-04T06:18:27.527Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-04T06:47:42.723Z\",\"reason\":\"clean-exit-without-handoff\"}]"
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

## Shots
```json
[
{
"label": "Hide Completed Stories toggle in the Stories header (default off)",
"target": "default",
"route": "/stories",
"highlight": ".stories-filter-toggle"
},
{
"label": "Stories list after checking Hide Completed Stories",
"target": "default",
"route": "/stories",
"highlight": ".stories-filter-toggle",
"steps": [
{
"click": ".stories-filter-toggle button"
},
{
"waitMs": 300
}
]
}
]
```

## Activity

- 2026-11-03T09:13:40Z · created · hello@repoos.org
- 2026-11-03T09:14:09Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-11-04T04:22:41Z · status inbox→ready
- 2026-11-04T04:22:46Z · cli_override
- 2026-11-04T04:23:01Z · model_override
- 2026-11-04T04:23:31Z · status ready→active, branch
- 2026-11-04T04:25:21Z · body
- 2026-11-04T04:32:43Z · message_queued at 2026-11-04T04:32:43.428Z
- 2026-11-04T04:32:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T04:32:51Z · body
- 2026-11-04T04:37:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T04:41:10Z · body
- 2026-11-04T04:45:36Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-04T04:45:36Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-04T04:45:37Z · message_delivered: 1 message(s)
- 2026-11-04T05:09:29Z · body
- 2026-11-04T05:56:27Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-11-04T06:18:27Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3 in 30m
- 2026-11-04T06:47:42Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3 in 30m
- 2026-11-04T06:48:23Z · note: handoff requested (ui-review)
- 2026-11-04T06:52:46Z · CTO nudge: held — handoff gate is running
- 2026-11-04T07:14:14Z · handoff failed · ui-review handoff failed at review · Engineering report narrative is 1202 words; the hard limit is 1,200 words of narrative. Shorten it and request handoff again.
- 2026-11-04T07:50:44Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — ui-review handoff failed at review · Engineering report narrative is 1202 words; the hard limit is 1,200 words of narrative. Shorten it and request handoff again. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-04T07:50:45Z · note: handoff requested (cli)
- 2026-11-04T08:20:43Z · handoff failed · task-file handoff failed at review · Engineering report narrative is 1202 words; the hard limit is 1,200 words of narrative. Shorten it and request handoff again.
- 2026-11-04T08:27:50Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — ui-review handoff failed at review · Engineering report narrative is 1202 words; the hard limit is 1,200 words of narrative. Shorten it and request handoff again.
