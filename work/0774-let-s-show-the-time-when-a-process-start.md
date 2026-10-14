---
id: "0774"
title: Show process start time beside running chip
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-process-start-time-beside-running-c
created_at: "2026-10-14T04:19:10Z"
updated_at: "2026-10-14T04:26:33Z"
---
## Problem

The running indicator does not show when a process started, so users cannot quickly tell how long it has been running.

## Desired UX

Show a human-readable elapsed time, such as “17 hours ago,” next to the running chip. On hover, show the start time as a timestamp, such as “Tues 11:18.”

## Acceptance criteria

- [ ] The running chip is accompanied by a human-readable time indicating when the process started.
- [ ] Hovering over that time shows the process start timestamp.

## Notes for AI

- Place the time next to the existing running chip.
- Use the process start time as the source for both displays.
- Assume the hover timestamp should follow the existing date/time formatting conventions in the UI.

## Original prompt

Let's show the time when a process started running (and human readable like 17 hours ago -- on hover you can show the full timestamp like Tues 11:18), but it next to the running chip.

## Screenshots

![Screenshot-2026-10-14-at-11.08.38](/api/tasks/0774/attachments/screenshot-1.png)

## Activity

- 2026-10-14T04:19:10Z · created · hello@repoos.org
- 2026-10-14T04:19:17Z · screenshots
- 2026-10-14T04:19:35Z · status draft→inbox, title, area, body
- 2026-10-14T04:22:37Z · status inbox→ready
- 2026-10-14T04:22:41Z · status ready→active, branch
- 2026-10-14T04:26:33Z · body
