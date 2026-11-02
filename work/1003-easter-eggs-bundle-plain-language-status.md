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
updated_at: "2026-11-02T01:38:24Z"
review_passes: 3
review_rounds: 2
routing_switches: 1
routing_escalations: 1
last_check_failure: "repoos check at 2026-11-01T22:06:01.306Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Mission Control 2×2 panels (target \"default\"): loading state detected: loading text \"Loading…\" on / (http://127.0.0.1:58741/); [missing-target] Review pass selection and freshness (target \"default\"): highlight .review-history-wrap matched nothing on /work?task=1003&tab=review (http://127.0.0.1:58741/work?shotState=drawer:landable)"
dev_error_count: 1
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
The Review tab can make the selected report and its freshness unclear. The latest marker should describe the displayed report, and the reviewer identity should identify the coding agent that produced it.

### Desired UX
Select the newest review pass by default and visibly highlight whichever pass is selected. Keep a Latest marker on the Good to go callout row when the selected pass is newest; show Not latest there for an older selected pass. Show the reviewer coding agent (for example, Cursor or Codex) in the reviewer column, with its model in the separate model column.

### Acceptance criteria
- Test: the newest pass is selected by default and its row is visibly highlighted.
- Test: selecting another pass highlights that row and updates the report details and callout freshness marker together.
- Test: the Good to go callout shows Latest for the newest pass and Not latest for an older selected pass.
- Test: the reviewer column names the coding agent and the model remains in its separate column.
- Test: a late response for an earlier selection cannot replace the currently selected pass report or freshness marker.

### Notes for AI
Keep the selected pass highlight visible while its report is loading and after it loads. Tie report content, selected row, reviewer identity, and Latest/Not latest marker to the same selected pass. Preserve the existing latest-report behavior when no historical pass is selected.

## Shots
```json
[
{
  "label": "Checks show stale heartbeat status",
  "target": "default",
  "route": "/checks?shotState=checks:waiting",
  "highlight": ".ck-local-slot"
},
{
  "label": "Review pass history shows latest selection and reviewer",
  "target": "default",
  "route": "/work?task=9999&tab=review&shotState=drawer:reviewPasses",
  "highlight": ".review-history-table"
},
{
  "label": "Task card agent assignments preview on hover",
  "target": "default",
  "route": "/work?shotState=board:severalWorkingCards",
  "highlight": "[data-test-id=\"task-agent-preview\"]",
  "steps": [
    {
      "hover": "article[data-task-id=\"0980-1\"] button.tc-agent-btn"
    },
    {
      "waitMs": 250
    }
  ]
}
]
```

## E6 · Preview task agent assignments on hover
### Problem
The robot icon on a task card currently exposes agent assignments through its click-to-edit panel. People who only want to check assignments must open the editor and then close it again.

### Desired UX
Hovering the robot icon shows a compact, read-only table with the task’s PM, engineer, and reviewer roles and each role’s assigned coding agent and model. The preview does not open the editor. Clicking the icon continues to open the assignment editor. Keyboard users can inspect the same preview by focusing the icon, and touch users can inspect assignments through the existing click-to-open editor.

### Acceptance criteria
- Test: pointer hover shows the PM, engineer, and reviewer agent and model assignments without opening the editor.
- Test: moving the pointer away dismisses the preview, while clicking the icon still opens the assignment editor.
- Test: keyboard focus exposes the same assignment information accessibly.
- Test: touch activation provides access to the assignments through the editor.
- The preview is readable, does not obscure the task title or essential controls, and stays within the viewport.

### Notes for AI
Keep the hover preview compact and read-only, with a clear role/agent/model hierarchy. Preserve the click-to-edit flow. Ensure focus and touch remain usable, and clamp the preview within short and narrow viewports.

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
- 2026-11-01T19:39:21Z · message_queued at 2026-11-01T19:39:21.926Z
- 2026-11-01T19:40:05Z · body: Problem\n\nThe robot icon on a task card currently exposes the agent assignments through its click-to-edit panel. People who only want to check which agents are assigned must open the editor and then close it again.\n\n## Desired UX\n\nHovering the robot icon shows a compact, well-presented table with the task’s three role assignments (PM, engineer, reviewer), coding agent, and model. The preview is read-only. Clicking the icon still opens the assignment editor. Preserve an accessible way to inspect assignments for keyboard and touch users.\n\n## Acceptance criteria\n\n- Test: pointer hover on the robot icon reveals the three role/agent/model assignments without opening the editor.\n- Test: moving the pointer away dismisses the preview; clicking the icon still opens the assignment editor.\n- Test: keyboard focus and touch interaction provide an accessible way to view the same assignments.\n- The preview is readable, does not obscure the task title or essential controls, and remains within the viewport.\n\n## Notes for AI\n\nUse the attached screenshot as context. Match the visual hierarchy of the existing assignment editor while keeping the hover preview compact and read-only. (removed)
- 2026-11-01T19:40:05Z · message_queued at 2026-11-01T19:40:05.977Z
- 2026-11-01T19:40:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T20:01:02Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 4s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T20:01:17Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T20:56:28Z · body
- 2026-11-01T21:00:25Z · handoff_deferred: 5 queued message(s) must be read before review
- 2026-11-01T21:00:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T21:00:26Z · message_delivered: 5 message(s)
- 2026-11-01T21:05:44Z · message_queued at 2026-11-01T21:05:44.219Z
- 2026-11-01T21:05:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T21:07:02Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T21:12:43Z · body
- 2026-11-01T21:16:28Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T21:16:28Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T21:16:28Z · message_delivered: 1 message(s)
- 2026-11-01T21:30:47Z · body
- 2026-11-01T22:05:57Z · note: ui verification failed (2 issue(s)): [missing-target] Mission Control 2×2 panels (target "default"): loading state detected: loading text "Loading…" on / (http://127.0.0.1:58741/); [missing-target] Review pass selection and freshness (target "default"): highlight .review-history-wrap matched nothing on /work?task=1003&tab=review (http://127.0.0.1:58741/work?shotState=drawer:landable)
- 2026-11-01T22:07:51Z · body
- 2026-11-01T22:15:44Z · message_queued at 2026-11-01T22:15:44.445Z
- 2026-11-01T22:15:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T22:19:45Z · body
- 2026-11-01T22:20:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T22:36:48Z · body
- 2026-11-01T22:47:22Z · body
- 2026-11-01T22:50:44Z · CTO nudge: held — handoff gate is running
- 2026-11-01T22:50:51Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T22:50:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T22:50:51Z · message_delivered: 1 message(s)
- 2026-11-01T23:23:57Z · status active→review
- 2026-11-01T23:23:58Z · note: Task body is underspecified: E5: missing Notes for AI; E6: missing Problem, Desired UX, Acceptance criteria, Notes for AI
- 2026-11-01T23:32:31Z · note: review pass 1: needs some work
- 2026-11-01T23:32:33Z · status review→active
- 2026-11-01T23:32:36Z · CTO nudge: held — remote validation is running
- 2026-11-01T23:51:48Z · body
- 2026-11-02T00:11:42Z · message_queued at 2026-11-02T00:11:42.311Z
- 2026-11-02T00:25:49Z · status active→review
- 2026-11-02T00:25:49Z · note: Task body is underspecified: E5: missing Notes for AI; E6: missing Problem, Desired UX, Acceptance criteria, Notes for AI
- 2026-11-02T00:32:44Z · note: review pass 2: needs some work
- 2026-11-02T00:32:45Z · message_delivered: 1 message(s)
- 2026-11-02T00:32:46Z · status review→active
- 2026-11-02T00:32:49Z · CTO nudge: held — remote validation is running
- 2026-11-02T00:33:17Z · body: E5 · Make review-pass selection and reviewer identity clear (added 9, removed 7)
- 2026-11-02T00:33:17Z · message_queued at 2026-11-02T00:33:17.881Z
- 2026-11-02T00:33:22Z · body: E6 · Preview task agent assignments on hover (added 12)
- 2026-11-02T00:33:22Z · message_queued at 2026-11-02T00:33:22.541Z
- 2026-11-02T00:45:50Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T00:54:20Z · body
- 2026-11-02T01:04:31Z · body
- 2026-11-02T01:07:54Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-02T01:07:54Z · message_delivered: 2 message(s)
- 2026-11-02T01:15:49Z · message_queued at 2026-11-02T01:15:49.769Z
- 2026-11-02T01:15:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T01:18:29Z · body
- 2026-11-02T01:20:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T01:21:51Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T01:21:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T01:21:52Z · message_delivered: 1 message(s)
- 2026-11-02T01:22:13Z · status active→review
- 2026-11-02T01:25:26Z · handoff failed · could not auto-retry after check failure · This worktree already has a recorded live engineer for task #review:1003 (pid 72002)
- 2026-11-02T01:30:23Z · note: review pass 3: needs some work
- 2026-11-02T01:30:24Z · needs_input
- 2026-11-02T01:36:00Z · status review→active
- 2026-11-02T01:36:00Z · note: send-back — returned to active for engineer follow-up
- 2026-11-02T01:36:07Z · needs_input
- 2026-11-02T01:36:09Z · message_queued at 2026-11-02T01:36:09.769Z
- 2026-11-02T01:38:09Z · body
- 2026-11-02T01:38:24Z · body
