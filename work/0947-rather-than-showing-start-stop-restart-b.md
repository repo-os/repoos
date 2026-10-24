---
id: "0947"
title: Show dev target actions based on running state
type: feature
status: active
needs_input: true
needs_input_reason: review-failed
needs_input_detail: "the cursor agent exited without output: Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh"
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-dev-target-actions-based-on-running
created_at: "2026-10-24T04:07:30Z"
updated_at: "2026-10-24T11:13:56Z"
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

## Activity

- 2026-10-24T04:07:30Z · created · hello@repoos.org
- 2026-10-24T04:07:38Z · screenshots
- 2026-10-24T04:07:39Z · screenshots
- 2026-10-24T04:08:04Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-10-24T04:08:38Z · status inbox→ready
- 2026-10-24T04:08:44Z · status ready→active, branch
- 2026-10-24T06:20:16Z · status active→review
- 2026-10-24T06:22:14Z · note: review pass 1: failed — no usable report
- 2026-10-24T06:22:14Z · needs_input
- 2026-10-24T07:39:18Z · status review→active
- 2026-10-24T11:13:56Z · status active→review
- 2026-10-24T11:13:56Z · note: handoff requested (cli)
