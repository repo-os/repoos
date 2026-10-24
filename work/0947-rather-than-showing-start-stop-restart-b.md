---
id: "0947"
title: Show dev target actions based on running state
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-dev-target-actions-based-on-running
created_at: "2026-10-24T04:07:30Z"
updated_at: "2026-10-24T04:45:22Z"
---
## Problem

Dev page targets always show Start, Stop, and Restart buttons, even when some actions do not apply to the target's current state. The current layout also leaves a large blank space above the command.

## Desired UX

Show only Start when a target is not running. When it is running, show Restart and Stop instead. Keep Start and Restart the same color. Arrange the buttons in a column to the right of the command/URL column using flexbox, reducing the blank space above the command.

## Acceptance criteria

- [ ] A target that is not running shows only the Start button.
- [ ] A running target shows Restart and Stop, and does not show Start.
- [ ] Start and Restart use the same color.
- [ ] The target's buttons are arranged in a column to the right of its command/URL column using flexbox.
- [ ] The updated layout avoids the large blank space above the command.

## Notes for AI

- Use the target's existing running state to determine which buttons to show.
- Keep the change limited to the dev page target actions and their layout.

## Original prompt

Rather than showing Start / Stop / Restart buttons always on each dev page target we should show different buttons based on the current state of the dev target:
- when a target is not running only show the start button
- when a target is running show restart and stop buttons
- you can keep the color of start and restart buttons the same 

Also can we use a flexbox there so that the buttons are in a column to the right of the command/url  col so there's not a big white space above command like there is now?

## Screenshots

![Screenshot-2026-10-24-at-11.59.50](/api/tasks/0947/attachments/att_03986c8b-cc34-4043-b09b-f8f7efb23345.png)
![Screenshot-2026-10-24-at-12.00.54](/api/tasks/0947/attachments/att_239c9ed4-97fd-482c-8d53-653a40515afd.png)

## Shots
```json
[
{
"label": "Dev targets with running-state actions",
"target": "default",
"route": "/dev",
"highlight": ".dev-card-details",
"state": "dev:running"
}
]
```

## Activity

- 2026-10-24T04:07:30Z · created · hello@repoos.org
- 2026-10-24T04:07:38Z · screenshots
- 2026-10-24T04:07:39Z · screenshots
- 2026-10-24T04:08:04Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-10-24T04:08:38Z · status inbox→ready
- 2026-10-24T04:08:44Z · status ready→active, branch
- 2026-10-24T04:17:06Z · message_queued at 2026-10-24T04:17:06.628Z
- 2026-10-24T04:17:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-24T04:33:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-24T04:37:30Z · body
- 2026-10-24T04:38:23Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T04:38:23Z · message_delivered: 1 message(s)
- 2026-10-24T04:45:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
