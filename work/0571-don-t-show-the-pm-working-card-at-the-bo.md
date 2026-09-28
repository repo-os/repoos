---
id: "0571"
title: Don't show the PM working card at the bottom when the use…
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
pm_cli_override: cursor
pm_model_override: composer-2.5
created_at: "2026-09-28T06:11:24Z"
updated_at: "2026-09-28T06:11:25Z"
---
Don't show the PM working card at the bottom when the user clicks create task, because as soon as the PM starts generating something the new task tab opens anyway, and also most users will click away before the PM starts printing anything, so it just looks like a bad ui right now... also please remove this line of text at the screenshots: `PNG, JPEG, GIF, WebP, AVIF or BMP — attached to the new task when you create it.`  if necessary just show a little info icon  next to the label which on hover shows a properly stylised tooltip (see other examples of good popups in this repo, not the default html tooltip which is not a good ux).

## Original prompt

Don't show the PM working card at the bottom when the user clicks create task, because as soon as the PM starts generating something the new task tab opens anyway, and also most users will click away before the PM starts printing anything, so it just looks like a bad ui right now... also please remove this line of text at the screenshots: `PNG, JPEG, GIF, WebP, AVIF or BMP — attached to the new task when you create it.`  if necessary just show a little info icon  next to the label which on hover shows a properly stylised tooltip (see other examples of good popups in this repo, not the default html tooltip which is not a good ux).

## Screenshots

![Screenshot-2026-09-28-at-14.08.01](/api/tasks/0571/attachments/screenshot-1.png)

## Activity

- 2026-09-28T06:11:24Z · created · hello@repoos.org
- 2026-09-28T06:11:25Z · screenshots
