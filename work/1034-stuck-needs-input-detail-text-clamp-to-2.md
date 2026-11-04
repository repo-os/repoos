---
id: 1034
title: "Stuck/needs-input detail text: clamp to 2-3 lines on card and task panel, click opens Debug tab"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stuck-needs-input-detail-text-clamp-to-2
cli_override: cursor
model_override: composer-2.5
review_cli_override: opencode
review_model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-04T14:10:23Z"
updated_at: "2026-11-04T17:26:37Z"
---
## Problem

When a task is stuck or waiting (needs input, 'STUCK · SILENT 16M', check-wait escalations), the board card and the task panel's WAITING FOR YOU block print the whole diagnostic string. For a check-slot wait it is 6+ wrapped lines of pids and queue positions (e.g. 'waiting for a local check slot (3 ahead, position 4); waiting behind #1030 check (pid 50649, alive), #1024 check (pid 70210, alive), ...'), which makes the card tall, pushes the other cards down and buries the action button. The agreed design was 2-3 lines of info on a card; the panel already truncates with an ellipsis after ~2 lines but still shows too much and the card does not truncate at all. See attached screenshots (#1030 and #1024 cards, #1030 panel).

## Desired UX

- Board card: the stuck/needs-input explanation is clamped to at most 3 lines (CSS line-clamp, ellipsis), card height stays predictable.
- Task panel WAITING FOR YOU / stuck block: same clamp (2-3 lines).
- Clicking the clamped text (or a small 'Details' affordance) opens the task panel on the Debug tab (Status details) where the full, unclamped text is shown. The control must be keyboard-focusable and work on touch; no native title tooltip.
- Primary action button (Restart work / Pause work) stays visible on the card.

## Acceptance criteria

1. Test: a long wait message renders clamped on the card and in the panel (class/attribute assertion), and the full text is present in the Debug tab Status details.
2. Test: clicking the clamped text on a card opens the task panel with tab=debug.
3. No bespoke colors; contrast audit and hardcoded-colors guard pass in light and dark.
4. Declared `## Shots`: a card and the panel with a long check-wait message.

## Notes for AI

Source of the strings is the check-wait/queue-marker message and the stuck-card state in src/core/active-task-card.ts; the panel block is the 'Waiting for you' component in the task drawer. Reuse the existing `?tab=debug` route handling (/work?task=<id>&tab=debug). Related: #0272 (card error UX). Observation, not in scope: these cards also say 'slot holder has made no progress for 30 minutes (no heartbeat)' and '#1024 check (pid 57029, wedged)' for live holders — that false alarm is #1032.

## Screenshots

![6](/api/tasks/1034/attachments/att_2364700c-13b6-4d61-bae3-26951e1331f9.png)
![7](/api/tasks/1034/attachments/att_2b28ec2f-cbb2-4e29-bb45-ba83d5e3099c.png)

## Activity

- 2026-11-04T14:10:23Z · created · njachowski@gmail.com
- 2026-11-04T14:10:23Z · screenshots
- 2026-11-04T14:11:24Z · cli_override
- 2026-11-04T14:11:25Z · model_override
- 2026-11-04T14:11:31Z · review_cli_override
- 2026-11-04T14:11:33Z · review_model_override
- 2026-11-04T14:11:34Z · status inbox→ready
- 2026-11-04T14:11:38Z · status ready→active, branch
- 2026-11-04T17:26:37Z · status active→review
