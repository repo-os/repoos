---
id: 1003
title: "Easter eggs bundle: plain-language status and merge wording"
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-plain-language-status
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-01T15:37:17Z"
updated_at: "2026-11-01T19:39:21Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-01T19:34:32.531Z\",\"kind\":\"dev-error\"}]"
---
## Items
- [ ] **E1 · Replace “wedged” with heartbeat wording** (web) — describe a live check with an overdue heartbeat as “No recent heartbeat” and show when its last heartbeat arrived.
- [ ] **E2 · Replace “landed” and “landable” merge wording** (web) — use plain-language variants of “merged into main” for completed merges and “ready to merge” for eligible changes.
- [ ] **E3 · Mission Control panels use a balanced 2×2 layout** (web) — show the four panels in two columns and two rows, with equal medium heights between the current short and tall panels.
- [ ] **E4 · Combine default and custom agents in one tab** (web) — rename Default Agents to Agents, remove the Custom Agents tab, and render its section below Default Agents in the Agents tab.
- [ ] **E5 · Make review-pass selection and reviewer identity clear** (web) — place Latest on the Good to go row, highlight the selected pass, mark an older pass Not latest, and show the reviewer coding agent.
- [ ] **E6 · Preview task agent assignments on hover** (web) — hovering the task card robot icon shows a compact, readable table of the task’s PM, engineer, and reviewer agent/model assignments without opening the edit panel; clicking the icon continues to open the editor, and keyboard/touch users retain an accessible way to view assignments.


## E1 · Replace “wedged” with heartbeat wording

### Problem

“Wedged” is internal jargon and does not tell a user what RepoOS observed. The checks page can show this label for a check process whose heartbeat has stopped updating.

### Desired UX

Use “No recent heartbeat” and show the last heartbeat time. Preserve the distinction between a process that is alive but not reporting and a process that has exited.

### Acceptance criteria

- Test: checks page renders “No recent heartbeat” for a live slot whose heartbeat is older than the configured threshold, and includes the last heartbeat age.
- Test: a fresh heartbeat is not described as missing or stalled.

### Notes for AI

Keep internal identifiers and code comments as appropriate; this item concerns text shown to users. Avoid implying the process is dead when RepoOS only knows that its heartbeat is stale.

## E2 · Replace “landed” in user-facing merge messages

### Problem
User-facing copy uses “landed,” “landable,” and related forms to describe merge success or eligibility. These terms are jargon and do not say plainly whether work is already in main or can be merged there.

### Desired UX
Across user-facing UI, notifications, CLI messages, and user documentation, use clear wording that states the merge status. For successful merges, say “merged into main,” “now in main,” or another context-appropriate equivalent. For eligibility, say “ready to merge” or “can be merged into main.” Keep the `repoos landable` CLI command and API identifiers intact for compatibility; change their human-facing descriptions.

### Acceptance criteria
- Test: user-facing success messages describe completed merges as merged into main or an equally clear contextual equivalent.
- Test: user-facing eligibility labels describe work as ready to merge or can be merged into main.
- Audit: UI, notifications, CLI output/help, and user docs do not use “landed” or “landable” as vague merge-status language.
- Test: the existing `repoos landable` CLI command and API route remain compatible.

### Notes for AI
Change user-facing merge-status and merge-eligibility wording throughout product surfaces. Preserve technical command names, API routes/fields, internal identifiers, and unrelated literal uses such as a browser landing on a route. Choose a natural variation of “merged into main” that accurately describes the specific state; do not imply a merge happened when it did not.


## E3 · Mission Control panels use a balanced 2×2 layout

### Problem
Mission Control currently puts Feature releases, Live activity, and Needs a decision in one row, with Needs your attention below. The panels have uneven heights, making the page harder to scan and compare.

### Desired UX
At desktop widths, arrange the four panels in a 2×2 grid. Give all four equal medium heights, between the current short and tall panels, and let each panel's contents scroll within it. Keep narrower layouts responsive and readable.

### Acceptance criteria

- Test: Mission Control lays out all four panels in a 2×2 grid with equal heights at desktop widths; responsive narrow layouts remain readable.

### Notes for AI
The four panels are Feature releases, Live activity, Needs a decision, and Needs your attention. Preserve their existing content, refresh behavior, and independent scrolling while changing the grid and sizing.


## E4 · Combine default and custom agents in one tab

### Problem
Agents settings splits default agents and custom agents across separate tabs. This makes related configuration harder to find and forces users to switch tabs to see the agents that work in the same repo.

### Desired UX
Rename the “Default Agents” tab to “Agents”. Remove the separate “Custom Agents” tab and show the Custom Agents section below the Default Agents section in the Agents tab. Keep the remaining tabs and their contents unchanged.

### Acceptance criteria

- Test: Agents settings has one Agents tab with Default Agents followed by Custom Agents; there is no separate Custom Agents tab.

### Notes for AI
Use the attached screenshot as layout context. Its Cursor model-refresh timeout banner is incidental and is not part of this item.

## E5 · Make review-pass selection and reviewer identity clear
### Problem

The Review tab shows Latest on a separate row below the green Good to go callout, making the active selection unclear. Selecting an older review pass does not clearly communicate that it is not the latest. The reviewer column also displays the generic word “reviewer” instead of the coding agent that produced the review.

### Desired UX

Keep the Latest marker on the right side of the Good to go callout row. Select the latest pass by default and visibly highlight whichever pass is selected. When an older pass is selected, change the callout marker to “Not latest” using a distinct color. Show the reviewer coding agent (for example, Cursor or Codex) in the reviewer column; keep the model in its separate column.

### Acceptance criteria

- The latest pass is selected by default, visibly highlighted, and marked Latest in the callout row.
- Selecting an older pass highlights that row and changes the callout marker to Not latest with a distinct visual treatment.
- The selected pass controls the displayed review details; the Latest marker does not remain when an older pass is selected.
- The reviewer column displays the recorded coding agent identity instead of the generic “reviewer” role label, while preserving the model column.
- Tests cover default selection, switching between latest and older passes, reviewer identity, and responsive/accessibility behavior.

## Shots
```json
[
{
"label": "Mission Control 2×2 panels",
"target": "default",
"route": "/",
"highlight": ".dash-grid"
},
{
"label": "Agents tab with default and custom sections",
"target": "default",
"route": "/agents",
"highlight": ".agents-tab-content"
},
{
"label": "Review pass selection and freshness",
"target": "default",
"route": "/work?task=1003&tab=review",
"highlight": ".review-history-wrap",
"state": "drawer:landable"
}
]
```

## E6 · Preview task agent assignments on hover
## Problem

The robot icon on a task card currently exposes the agent assignments through its click-to-edit panel. People who only want to check which agents are assigned must open the editor and then close it again.

## Desired UX

Hovering the robot icon shows a compact, well-presented table with the task’s three role assignments (PM, engineer, reviewer), coding agent, and model. The preview is read-only. Clicking the icon still opens the assignment editor. Preserve an accessible way to inspect assignments for keyboard and touch users.

## Acceptance criteria

- Test: pointer hover on the robot icon reveals the three role/agent/model assignments without opening the editor.
- Test: moving the pointer away dismisses the preview; clicking the icon still opens the assignment editor.
- Test: keyboard focus and touch interaction provide an accessible way to view the same assignments.
- The preview is readable, does not obscure the task title or essential controls, and remains within the viewport.

## Notes for AI

Use the attached screenshot as context. Match the visual hierarchy of the existing assignment editor while keeping the hover preview compact and read-only.


## Problem\n\nThe robot icon on a task card currently exposes the agent assignments through its click-to-edit panel. People who only want to check which agents are assigned must open the editor and then close it again.\n\n## Desired UX\n\nHovering the robot icon shows a compact, well-presented table with the task’s three role assignments (PM, engineer, reviewer), coding agent, and model. The preview is read-only. Clicking the icon still opens the assignment editor. Preserve an accessible way to inspect assignments for keyboard and touch users.\n\n## Acceptance criteria\n\n- Test: pointer hover on the robot icon reveals the three role/agent/model assignments without opening the editor.\n- Test: moving the pointer away dismisses the preview; clicking the icon still opens the assignment editor.\n- Test: keyboard focus and touch interaction provide an accessible way to view the same assignments.\n- The preview is readable, does not obscure the task title or essential controls, and remains within the viewport.\n\n## Notes for AI\n\nUse the attached screenshot as context. Match the visual hierarchy of the existing assignment editor while keeping the hover preview compact and read-only.

## Screenshots

![Screenshot-2026-11-01-at-23.30.22](/api/tasks/1003/attachments/att_1cfc9082-f10e-43ff-8458-3edfc582e276.png)
![Screenshot-2026-11-01-at-23.31.44](/api/tasks/1003/attachments/att_6dfbfffd-07f3-4c0f-8e59-f8a6df429326.png)
![Screenshot-2026-11-01-at-23.30.58](/api/tasks/1003/attachments/att_b17f9b26-3b1a-4276-9c56-124c2c78c9b9.png)
![Mission Control panels have uneven heights and a 3+1 layout](/api/tasks/1003/attachments/att_5f8b6a2b-d1b4-469c-bb0f-bdfe98eddb91.png)
![Agents settings reference: combine default and custom agent sections](/api/tasks/1003/attachments/att_003c5df7-edd1-40f2-bc8f-271510dca214.png)
![Review passes: move Latest into the callout row and identify the reviewer agent](/api/tasks/1003/attachments/att_44a3ed0f-5b52-49b1-bb92-0ff74721dcc1.png)
![Review pass selection: highlight the selected older pass and mark it Not latest](/api/tasks/1003/attachments/att_a1a8b279-092b-4e5f-aed7-1b9cb717ef19.png)
![Task card robot icon and current agent-assignment editor/tooltip](/api/tasks/1003/attachments/att_0f6fb580-128d-467e-9f85-6f67571e1220.png)

## Activity

- 2026-11-01T15:37:17Z · created · njachowski@gmail.com
- 2026-11-01T15:37:19Z · screenshots
- 2026-11-01T15:39:05Z · body: Items (added 1, removed 2)
- 2026-11-01T15:39:05Z · body: E2 · Replace “landed” in user-facing merge messages (added 1, removed 1)
- 2026-11-01T15:39:05Z · note: bundle edit E2
- 2026-11-01T15:39:06Z · body: E2 · Replace “landed” in user-facing merge messages (added 1, removed 1)
- 2026-11-01T15:39:06Z · note: bundle edit E2
- 2026-11-01T15:39:06Z · body: E2 · Replace “landed” in user-facing merge messages (added 4, removed 2)
- 2026-11-01T15:39:06Z · note: bundle edit E2
- 2026-11-01T15:39:07Z · body: E2 · Replace “landed” in user-facing merge messages (added 1, removed 1)
- 2026-11-01T15:39:07Z · note: bundle edit E2
- 2026-11-01T15:43:00Z · screenshots
- 2026-11-01T15:43:05Z · body: Items (added 1); E3 · Mission Control panels use a balanced 2×2 layout (added)
- 2026-11-01T15:43:05Z · note: bundle add E3
- 2026-11-01T15:43:21Z · body: Items (added 1, removed 1)
- 2026-11-01T15:43:22Z · body: E3 · Mission Control panels use a balanced 2×2 layout (added 1)
- 2026-11-01T15:43:22Z · note: bundle edit E3
- 2026-11-01T15:43:22Z · body: E3 · Mission Control panels use a balanced 2×2 layout (added 1)
- 2026-11-01T15:43:22Z · note: bundle edit E3
- 2026-11-01T15:43:23Z · body: E3 · Mission Control panels use a balanced 2×2 layout (added 1)
- 2026-11-01T15:43:23Z · note: bundle edit E3
- 2026-11-01T16:06:48Z · screenshots
- 2026-11-01T16:06:49Z · body: Items (added 1); E4 · Combine default and custom agents in one tab (added)
- 2026-11-01T16:06:49Z · note: bundle add E4
- 2026-11-01T16:06:57Z · body: E4 · Combine default and custom agents in one tab (added 1)
- 2026-11-01T16:06:57Z · note: bundle edit E4
- 2026-11-01T16:06:58Z · body: E4 · Combine default and custom agents in one tab (added 1)
- 2026-11-01T16:06:58Z · note: bundle edit E4
- 2026-11-01T16:07:00Z · body: E4 · Combine default and custom agents in one tab (added 1)
- 2026-11-01T16:07:00Z · note: bundle edit E4
- 2026-11-01T18:37:00Z · body: Items (added 4, removed 3)
- 2026-11-01T18:37:00Z · screenshots
- 2026-11-01T18:37:16Z · body: Items (added 2, removed 2)
- 2026-11-01T18:37:16Z · screenshots
- 2026-11-01T18:37:44Z · body: E5 · Make review-pass selection and reviewer identity clear (added)
- 2026-11-01T18:40:54Z · review_cli_override, review_model_override
- 2026-11-01T18:41:01Z · status inbox→ready
- 2026-11-01T18:41:08Z · status ready→active, branch
- 2026-11-01T18:45:36Z · body
- 2026-11-01T18:51:22Z · message_queued at 2026-11-01T18:51:22.930Z
- 2026-11-01T18:51:23Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T18:55:45Z · note: adopted orphaned engineer pid 52726
- 2026-11-01T19:00:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T19:20:31Z · body
- 2026-11-01T19:31:10Z · body
- 2026-11-01T19:34:32Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T19:34:32Z · agent exited with an error (codex) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-01T19:34:32Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-01T19:34:36Z · needs_input
- 2026-11-01T19:34:36Z · message_delivered: 1 message(s)
- 2026-11-01T19:37:14Z · body
- 2026-11-01T19:39:05Z · body: Items (added 1, removed 5)
- 2026-11-01T19:39:05Z · message_queued at 2026-11-01T19:39:05.625Z
- 2026-11-01T19:39:06Z · body: E6 · Preview task agent assignments on hover (added); Problem\n\nThe robot icon on a task card currently exposes the agent assignments through its click-to-edit panel. People who only want to check which agents are assigned must open the editor and then close it again.\n\n## Desired UX\n\nHovering the robot icon shows a compact, well-presented table with the task’s three role assignments (PM, engineer, reviewer), coding agent, and model. The preview is read-only. Clicking the icon still opens the assignment editor. Preserve an accessible way to inspect assignments for keyboard and touch users.\n\n## Acceptance criteria\n\n- Test: pointer hover on the robot icon reveals the three role/agent/model assignments without opening the editor.\n- Test: moving the pointer away dismisses the preview; clicking the icon still opens the assignment editor.\n- Test: keyboard focus and touch interaction provide an accessible way to view the same assignments.\n- The preview is readable, does not obscure the task title or essential controls, and remains within the viewport.\n\n## Notes for AI\n\nUse the attached screenshot as context. Match the visual hierarchy of the existing assignment editor while keeping the hover preview compact and read-only. (added)
- 2026-11-01T19:39:06Z · screenshots
- 2026-11-01T19:39:06Z · message_queued at 2026-11-01T19:39:06.840Z
- 2026-11-01T19:39:20Z · body: Items (added 6, removed 1)
- 2026-11-01T19:39:20Z · message_queued at 2026-11-01T19:39:20.870Z
- 2026-11-01T19:39:21Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
