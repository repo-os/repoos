---
id: "0335"
title: "Show \"PM is working\" indicator on draft cards and track the initial PM run in the usage tab"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-pm-is-working-indicator-on-draft-ca
created_at: "2026-09-08T04:44:05Z"
updated_at: "2026-09-08T07:45:04Z"
---
## Problem

Free-form task creation lands a new task in drafts, where the PM agent fleshes it out before it can move to inbox. While that work is happening, the task card and the task panel look identical to any other idle draft — there is no sign anything is in progress, so users can't tell whether a draft is being actively worked on or is just sitting there.

Separately, on a task's usage tab, the initial PM run that creates and fleshes out the task often appears as a blank entry — no cost, no usage numbers. It's unclear whether the initial PM run is tracked at all or just attributed incorrectly; either way it reads as missing data.

## Desired UX

- While the PM agent is actively fleshing out a draft, its card shows a clear "PM is working"-style indicator (e.g. spinner or status badge), and the task panel shows the same, so it's obvious the draft is being processed rather than idle.
- The indicator disappears when the PM run finishes; on success the task moves to inbox as it does today, and a failed run must not leave the task looking like it's still being worked.
- In the usage tab, the initial PM creation/flesh-out run appears with real cost and token usage like any other tracked run — no blank PM entries.

## Acceptance criteria

- [ ] A draft card shows an active "PM is working" indicator while the PM agent is fleshing it out
- [ ] The task panel shows the same indicator for that task
- [ ] The indicator clears when the PM run completes, including on failure (never stuck showing "working")
- [ ] The initial PM run's cost and token usage appear in the task's usage tab
- [ ] Blank PM entries with no cost/usage no longer appear in the usage tab
- [ ] `repoos check` passes

## Notes for AI

- "PM is working" is the user's suggested wording; a concise badge/spinner matching existing card status-label conventions is fine.
- Assumption: the blank usage entry means the initial PM run either isn't attributing usage to the task (e.g. it runs before the task id exists) or goes through a recording path that skips cost/usage capture — investigate the actual recording path before choosing a fix.
- Assumption: on a failed PM run the indicator clears and the draft simply doesn't advance to inbox; reuse any existing failure surfacing rather than inventing a new state.
- Likely touch points: the task card component, the task panel, the PM agent runner, and wherever usage/cost entries are recorded and rendered for the usage tab.

## Scope

Covers the in-progress indicator for the PM flesh-out phase (card + task panel) and correct cost/usage attribution of the initial PM run in that task's usage tab. Deferred: broader agent-activity feeds, cross-task usage dashboards, and any changes to how drafts transition between statuses.

## Original prompt

What a new task is created using free form it gets created first in drafts then the PM agent works on fleshing it out and it could go to inbox if successful, but currently the card UI doesn't show that it's being worked on, so add some indicator on the card and task panel for such tasks (.e.g. PM is working). also is the initial PM that helps create the task and flesh it out being tracked with cost/usage in the usage tab of the task? I see there's often a blank entry for PM without cost/usage , so I wonder if there's annoother way.

## Activity

- 2026-09-08T04:44:05Z · created · hello@repoos.org
- 2026-09-08T04:45:16Z · status draft→inbox, title, area, body
- 2026-09-08T05:27:44Z · status inbox→ready
- 2026-09-08T05:28:16Z · status ready→active, branch
