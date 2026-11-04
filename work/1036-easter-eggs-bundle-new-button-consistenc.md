---
id: 1036
title: "Easter eggs bundle: New-button consistency and card popover"
type: chore
status: active
priority: p2
area: [web, server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-new-button-consistenc
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-11-04T17:57:32Z"
updated_at: "2026-11-04T18:46:42Z"
---
## Items
- E1 · "New <x>" buttons: match "New task" in style and position (New schedule, New reminder, New environment)
- E2 · Task-card agent popover auto-closes after a configurable delay (moved from #1026 E7)
- E3 · Driver brief / CTO digest: do not call an engineer "stalled" while its check has a live heartbeat
- E4 · Uncommitted-changes panel: commit message textarea is far too tall (min-height 230px from .ff-textarea wins)

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

## Screenshots

![4](/api/tasks/1036/attachments/att_ff8d8ab7-9f80-4d8d-9282-691190506b8b.png)
![5](/api/tasks/1036/attachments/att_0f3fe446-3b8b-4f80-b171-a4b8982c0288.png)
![6](/api/tasks/1036/attachments/att_e2f6d405-3c84-4ac6-ba15-4653d9b1cc13.png)
![7](/api/tasks/1036/attachments/att_c1ed2892-fe58-41a6-987d-d8211aa48a65.png)

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
