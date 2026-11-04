---
updated_at: "2026-11-04T21:28:13Z"
review_passes: 1
id: 1036
title: "Easter eggs bundle: New-button consistency and card popover"
type: chore
status: review
priority: p2
area: [web, server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-new-button-consistenc
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-11-04T17:57:32Z"
last_check_failure: "repoos check at 2026-11-04T20:40:10.142Z: repoos check failed: ui verification failed (3 issue(s)): [request] HTTP 401 for http://127.0.0.1:52583/api/project-environments (http://127.0.0.1:52583/api/project-environments); [request] Failed to load resource: the server responded with a status of 401 (Unauthorized) (http://127.0.0.1:52583/api/project-environments); [missing-target] New environment accent button (target \"default\"): highlight [data-testid=\"new-environment\"] matched nothing on /secrets (http://127.0.0.1:52583/secrets)"
---
## Items
- E1 · "New <x>" buttons: match "New task" in style and position (New schedule, New reminder, New environment)
- E2 · Task-card agent popover auto-closes after a configurable delay (moved from #1026 E7)
- E3 · Driver brief / CTO digest: do not call an engineer "stalled" while its check has a live heartbeat

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body. This is a second open easter-eggs bundle, started on purpose because #1026 was already full (core and docs items); this one holds the web items.

## E1 · "New <x>" buttons: match "New task" in style and position

### Problem

Most pages put their create action in one obvious place: an accent button with a plus icon in the top-right of the page header (Work: New task, Inputs: + New input, Stories: + New story, Context: New doc / New skill). Three are off-pattern, outline-styled, and sit somewhere else, so they are easy to miss:

- Agents → Scheduled Tasks, "New schedule": small outline button inline next to the section label (`src/ui-app/src/components/ScheduledTasksPanel.vue`).
- Agents → Reminders, "New reminder": small outline button in the panel heading row (`src/ui-app/src/components/RemindersPanel.vue`).
- Secrets, "New environment": outline button inside the environment selector row (`src/ui-app/src/views/SecretsView.vue`).

See the attached screenshots: New schedule, New reminder, the New task reference, and New environment.

### Desired UX

All three use the same button as New task and New input: accent variant, plus icon, the shared `new-btn` styling, placed at the top-right of the tab or page header row, right-aligned like the others. The buttons keep opening the same panels and keep their `data-testid`s. The Secrets "Add key" button is out of scope and stays as it is.

### Acceptance criteria

- [ai] Test: each of the three buttons renders as the accent variant with a plus icon and keeps its existing `data-testid`.
- [ai] Test: each still opens its create panel.
- [ai] Uses the shared button and `new-btn` styling from `style.css`, no bespoke colors; contrast audit and hardcoded-colors guard pass in light and dark.
- [ai] Declared `## Shots`: Agents → Scheduled Tasks, Agents → Reminders and Secrets, using `?tab=<id>` routes where the page has tabs.

### Notes for AI

Reference implementations: `WorkView.vue` (New task) and `InputsView.vue` (+ New input). Check for any other "New <x>" button that is off-pattern while you are there, and list what you found in the handoff report. One accent button per view: if the Secrets page then shows two accent buttons, say so in the report instead of restyling "Add key". Source: Nick, 2026-11-05.

## E2 · Task-card agent popover auto-closes after a configurable delay

### Problem

Clicking the robot icon on a task card opens the task's AI agents popover (PM / EN / RV agent and model). It stays open until the user clicks away, so it covers the neighbouring cards.

### Desired UX

The popover closes itself after 15 seconds, fading out smoothly rather than disappearing. The delay is a Settings control (seconds; 0 disables auto-close) so the user can change it. Any interaction with the popover (hover, focus or click inside) restarts the timer.

### Acceptance criteria

- [ai] Test: the popover closes after the configured delay, and stays open when the delay is 0.
- [ai] Test: interacting with the popover restarts the timer.
- [ai] The new key is in `getConfigSchema()` and on the appropriate Settings tab with clear copy, plus a test, per the repo rule on feature settings.
- [ai] Fade-out respects `prefers-reduced-motion`.

### Notes for AI

Find the popover from the robot icon in the board card component under src/ui-app/src/components. Reuse the existing styled popover, no native tooltip. Source: Nick, 2026-11-04. Moved here from #1026 (was E7 there).

## E3 · Driver brief and CTO digest: no "stalled" while a check has a live heartbeat
### Problem

`repoos driver brief` and the CTO decision digest report an engineer as "stalled" ("Restart the stuck engineer … process is running but output has gone quiet") while its `repoos check` is running with a live progress heartbeat. Engineers pipe the check through `tail`, so the agent is silent for the whole check. The task card already handles this (#1000, `src/core/active-task-card.ts` `checkHeartbeating`), but `src/server/driver-brief.ts` (runningAgents map) takes `stalled` straight from the runner's raw silence timer (`snapshotStats`, `src/server/agents.ts`). Seen 2026-11-05 on #1031 and #1035, both mid-check, both flagged. It also risks the CTO restarting an engineer and killing a healthy check.

### Desired UX

An engineer whose check is running with a valid heartbeat is not listed as stalled in the driver brief, the decision digest or the CTO restart-stalled-agent safe action. Genuine silence (no check, or a check past the stall window) is still flagged.

### Acceptance criteria

- [ai] Test: engineer silent past the stall timeout with a running, heartbeating check → brief `stalled: false`, no "Restart the stuck engineer" action.
- [ai] Test: same engineer with no check running, or a check whose heartbeat is past the check stall window → still `stalled: true`.
- [ai] The CTO restart-stalled-agent path uses the same predicate, so it cannot restart an engineer mid-check.
- [ai] Reuse the existing heartbeat predicate (`checkHeartbeating` / `isCheckHeartbeatStalled`) rather than a new threshold.

### Notes for AI

Source: Nick and the 2026-11-05 session. Docs to keep true if touched: `user-docs/check.md` "When a check is waiting".

## E4 · Commit message textarea too tall in Uncommitted changes panel
### Problem

In the Uncommitted changes panel (`src/ui-app/src/components/RepoDirtyPanel.vue`) the optional commit message textarea renders roughly 230px tall (8-9 lines) even though it has `rows="3"` and commit messages are short. Cause: `.repo-dirty-input { min-height: 68px }` (`style.css`, ~line 1311) has the same specificity as the shared `.ff-textarea { min-height: 230px }` (~line 8282), which comes later in the file and wins, so the 68px override never applies.

### Desired UX

The textarea is about 3 lines tall (roughly 68px) and still resizable vertically. The panel gives the freed space to the diff above it.

### Acceptance criteria

- [ai] The override actually wins: raise specificity (for example `.ff-textarea.repo-dirty-input`) or move the rule after `.ff-textarea`, with no `!important`.
- [ai] Test: the rendered textarea's computed min-height is below 100px.
- [ai] Declared `## Shots`: the Uncommitted changes panel with a dirty-main state fixture if one exists.

### Notes for AI

Source: Nick, 2026-11-05 (screenshot of the panel). Check other `.ff-textarea` call sites that set a smaller min-height the same way and list them in the handoff report; fix only this panel.

## Shots
```json
[
{
"label": "New schedule accent button",
"target": "default",
"route": "/agents?tab=scheduled",
"highlight": "[data-testid=\"new-schedule\"]"
},
{
"label": "New reminder accent button",
"target": "default",
"route": "/agents?tab=reminders",
"highlight": "[data-testid=\"new-reminder\"]"
},
{
"label": "New environment accent button",
"target": "default",
"route": "/secrets",
"highlight": "[data-testid=\"new-environment\"]",
"state": "secrets:populated"
},
{
"label": "Commit message field is three lines",
"target": "default",
"route": "/",
"highlight": ".repo-dirty-input",
"steps": [
{
"click": "[data-test-id=\"side-git-dirty\"]"
},
{
"waitFor": ".repo-dirty-input"
}
],
"state": "repo:dirtyMain"
}
]
```

## Screenshots

![4](/api/tasks/1036/attachments/att_ff8d8ab7-9f80-4d8d-9282-691190506b8b.png)
![5](/api/tasks/1036/attachments/att_0f3fe446-3b8b-4f80-b171-a4b8982c0288.png)
![6](/api/tasks/1036/attachments/att_e2f6d405-3c84-4ac6-ba15-4653d9b1cc13.png)
![7](/api/tasks/1036/attachments/att_c1ed2892-fe58-41a6-987d-d8211aa48a65.png)

## Activity

- 2026-11-04T17:57:32Z · created · njachowski@gmail.com
- 2026-11-04T17:57:32Z · screenshots
- 2026-11-04T18:35:32Z · body: Items (added 1)
- 2026-11-04T18:35:33Z · body: E3 · Driver brief and CTO digest: no "stalled" while a check has a live heartbeat (added)
- 2026-11-04T18:35:34Z · area
- 2026-11-04T18:39:56Z · cli_override
- 2026-11-04T18:39:58Z · model_override
- 2026-11-04T18:40:01Z · status inbox→ready
- 2026-11-04T18:40:05Z · status ready→active, branch
- 2026-11-04T18:46:42Z · body: Items (added 1)
- 2026-11-04T18:46:42Z · message_queued at 2026-11-04T18:46:42.738Z
- 2026-11-04T18:46:43Z · body: E4 · Commit message textarea too tall in Uncommitted changes panel (added)
- 2026-11-04T18:46:43Z · message_queued at 2026-11-04T18:46:43.942Z
- 2026-11-04T18:47:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T18:48:35Z · body: Items (removed 1)
- 2026-11-04T18:48:37Z · message_queued at 2026-11-04T18:48:37.676Z
- 2026-11-04T18:48:47Z · note: adopted orphaned engineer pid 50901
- 2026-11-04T18:50:42Z · body
- 2026-11-04T18:53:42Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T19:08:13Z · body
- 2026-11-04T19:17:14Z · handoff_deferred: 3 queued message(s) must be read before review
- 2026-11-04T19:17:14Z · message_queued at 2026-11-04T19:17:14.711Z
- 2026-11-04T19:17:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: no assistant message · stderr: (empty)
- 2026-11-04T19:17:15Z · message_delivered: 4 message(s)
- 2026-11-04T19:28:44Z · message_queued at 2026-11-04T19:28:44.512Z
- 2026-11-04T19:28:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-04T19:30:36Z · body
- 2026-11-04T19:33:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-04T19:41:59Z · CTO nudge: held — handoff gate is running
- 2026-11-04T19:57:28Z · note: ui verification failed (3 issue(s)): [request] HTTP 401 for http://127.0.0.1:62758/api/project-environments (http://127.0.0.1:62758/api/project-environments); [request] Failed to load resource: the server responded with a status of 401 (Unauthorized) (http://127.0.0.1:62758/api/project-environments); [missing-target] New environment accent button (target "default"): highlight [data-testid="new-environment"] matched nothing on /secrets (http://127.0.0.1:62758/secrets)
- 2026-11-04T19:57:28Z · message_queued at 2026-11-04T19:57:28.994Z
- 2026-11-04T19:57:32Z · message_delivered: 1 message(s)
- 2026-11-04T20:08:19Z · body
- 2026-11-04T20:12:08Z · note: adopted orphaned engineer pid 55874
- 2026-11-04T20:17:06Z · CTO nudge: held — handoff gate is running
- 2026-11-04T20:40:06Z · note: ui verification failed (3 issue(s)): [request] HTTP 401 for http://127.0.0.1:52583/api/project-environments (http://127.0.0.1:52583/api/project-environments); [request] Failed to load resource: the server responded with a status of 401 (Unauthorized) (http://127.0.0.1:52583/api/project-environments); [missing-target] New environment accent button (target "default"): highlight [data-testid="new-environment"] matched nothing on /secrets (http://127.0.0.1:52583/secrets)
- 2026-11-04T20:40:06Z · message_queued at 2026-11-04T20:40:06.920Z
- 2026-11-04T20:40:09Z · message_delivered: 1 message(s)
- 2026-11-04T20:43:37Z · body
- 2026-11-04T20:52:59Z · body
- 2026-11-04T20:56:42Z · CTO nudge: held — handoff gate is running
- 2026-11-04T21:05:05Z · CTO nudge: held — handoff gate is running
- 2026-11-04T21:27:12Z · status active→review
- 2026-11-04T21:27:12Z · message_queued at 2026-11-04T21:27:12.460Z
- 2026-11-04T21:28:13Z · note: review pass 1: good to go

