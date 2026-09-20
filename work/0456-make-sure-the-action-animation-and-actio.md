---
updated_at: "2026-09-20T00:09:28Z"
review_passes: 1
id: "0456"
title: Fix task panel animation and message consistency
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-task-panel-animation-and-message-con
review_model_override: opencode-go/hy3
created_at: "2026-09-19T23:18:59Z"
dev_error_count: 1
---
## Problem

The task panel UI has three related display inconsistencies that degrade the UX:

1. Action animation color doesn't always match the action text color (e.g., purple animation with blue text)
2. Critical messages like "needs input" and "reviewer crashed" only display in the dev tab, so users on other tabs miss them
3. The "reviewer is working" status appears in 4 separate places (3 yellow, 1 purple) instead of once, creating visual clutter and color inconsistency

## Desired UX

1. Action animation and action text always use matching colors throughout the task panel
2. Critical status messages display above the tab navigation so they're visible regardless of active tab
3. "Reviewer is working" status with animation appears exactly once at the top of the task panel, always in yellow

## Acceptance criteria

- [ ] Action animation color matches action text color in all task states
- [ ] "Needs input" and "reviewer crashed" messages render above the tabs, not only in the dev tab
- [ ] "Reviewer is working" status appears exactly once at the top of the task panel
- [ ] "Reviewer is working" indicator uses consistent yellow color throughout
- [ ] No duplicate action status indicators on the task panel

## Notes for AI

- This is a task panel/task view UI consolidation task
- The assumption is yellow is the correct color for "reviewer is working" (appears 3/4 times)
- Look for where action status is rendered multiple times and consolidate to a single location
- Move critical messages out of tab-specific rendering and into a shared message area above tabs
- Verify action animation components use the same color scheme as their paired text labels

## Original prompt

Make sure the action animation and action text in the tasks are the same color (e.g. purple+purple, blue+blue, never purple+blue). Also why when "needs input" and reviewer crashed does that message show in the dev tab? it should show above the tabs since the user should see it on any tab. Also why does it show in 4 places that the reviewer is working (with action animation) - 3 times in yellow and 1 time in purple...just show it the once in yellow at the tope, on the task panel only ever show the task action animation+description once with  and ideally always in the same place at the top.

## Screenshots

![Screenshot-2026-09-20-at-07.15.08](/api/tasks/0456/attachments/screenshot-1.png)
![Screenshot-2026-09-20-at-06.30.27](/api/tasks/0456/attachments/screenshot-2.png)
![Screenshot-2026-09-20-at-01.11.11](/api/tasks/0456/attachments/screenshot-3.png)

## Activity

- 2026-09-19T23:18:59Z · created · hello@repoos.org
- 2026-09-19T23:18:59Z · screenshots
- 2026-09-19T23:19:00Z · screenshots
- 2026-09-19T23:19:00Z · screenshots
- 2026-09-19T23:19:16Z · status draft→inbox, title, area, type, body
- 2026-09-19T23:19:49Z · status inbox→ready
- 2026-09-19T23:21:57Z · status ready→active, branch
- 2026-09-19T23:41:15Z · agent exited with an error (opencode) · error: Upstream request failed: [insufficient_user_quota] You're out of credits — this request needs $0.03. Add credits to keep going: https://www.orcarouter.ai/console/billing?ref=err_credit_gate#add-credits (request id: 202609192341146656946338268d9d6zYF9SpNt)
- 2026-09-19T23:46:01Z · review_model_override
- 2026-09-19T23:46:10Z · needs_input
- 2026-09-20T00:07:02Z · status active→review

