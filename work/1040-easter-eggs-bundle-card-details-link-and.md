---
id: 1040
title: "Easter eggs bundle: card details link and agent popover rows"
type: chore
status: ready
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: muse
created_at: "2026-11-05T11:41:20Z"
updated_at: "2026-11-06T01:51:13Z"
---
## Items
- E1 · Task card: drop the redundant "Details" link under the needs-input blurb
- E2 · Task-card agent hover popover: rows open the agent editor on click

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body. Source: Nick, 2026-11-05. The attached screenshots show the card blurb (E1) and the hover popover (E2).

## E1 · Task card: drop the redundant "Details" link under the needs-input blurb

### Problem

A task card in needs-input state (for example "NEEDS HUMAN STEP") shows a truncated blurb ending in an ellipsis, and below it an underlined "Details" link. The blurb is already clickable and opens the same details, and the ellipsis already tells the user there is more, so the link is clutter.

### Desired UX

The blurb alone is the affordance: no separate "Details" link on the card. Clicking the blurb opens the same details as before. The blurb stays keyboard-focusable with an accessible name (for example a button role with an `aria-label` such as "Show details"), and gets a pointer cursor and hover/focus state so it still reads as clickable.

### Acceptance criteria

- [ai] Test: a needs-input card renders no "Details" link, and clicking the blurb still opens the details.
- [ai] Test: the blurb is reachable by keyboard (Enter/Space opens the details) and has an accessible name.
- [ai] Check other cards that use the same blurb component (held, error, human-step) so none keep a stray "Details" link, and list what you found in the handoff report.
- [ai] Declared `## Shots`: the board with a needs-human-step card, using a `state` fixture; highlight the blurb.

### Notes for AI

Find the card component by grepping for the "Details" label and the `NEEDS HUMAN STEP` text under `src/ui-app/src/components/`. No bespoke colors: use existing tokens; the contrast audit and hardcoded-colors guard must pass.

## E2 · Task-card agent hover popover: rows open the agent editor on click

### Problem

Hovering the robot (AI) icon on a task card shows a popover listing the PM, Engineer and Reviewer agent and model. Clicking the icon itself opens the agent editor, but the rows in the hover popover are not clickable, so the user has to move to the icon and click it instead.

### Desired UX

Each popover row (PM, Engineer, Reviewer) is clickable and opens the same agent editor the icon click opens, for that role if the editor supports focusing a role (otherwise just opens it). Rows show a pointer cursor and a hover/focus state, are keyboard focusable, and moving the mouse from the icon into the popover does not close it before the click.

### Acceptance criteria

- [ai] Test: clicking each row opens the same editor as the icon click, focused on that role if supported.
- [ai] Test: rows are keyboard operable (Tab to focus, Enter/Space activates) and have accessible names (role, agent, model).
- [ai] The popover still closes as it does today (delay, click-away); it stays open while the pointer is over it. Interacts with the auto-close delay from #1036 E2: keep that behavior working.
- [ai] Uses the shared popover/tooltip pattern (body-teleported layer carries `data-overlay-layer`), no native `title` tooltips, no bespoke colors.
- [ai] Declared `## Shots`: the board with the popover open (hover step on the AI icon), highlight the rows.

### Notes for AI

Find the popover by grepping for "Reviewer" and the robot icon in `src/ui-app/src/components/` (task card). Reuse the handler the icon's click already calls.

## Screenshots

![Task card: needs-human-step blurb with redundant Details link](/api/tasks/1040/attachments/att_05cfe9bc-bf21-47d7-81e2-e6441010ab59.png)
![Agent popover rows (compact)](/api/tasks/1040/attachments/att_ac85825f-2f48-40b9-bdbf-40e73126b042.png)
![Agent popover on hover: PM, Engineer, Reviewer rows](/api/tasks/1040/attachments/att_762cb0d2-a0bb-4e0e-a21f-240d925cd002.png)

## Activity

- 2026-11-05T11:41:20Z · created · njachowski@gmail.com
- 2026-11-05T11:41:21Z · screenshots
- 2026-11-05T14:38:37Z · cli_override
- 2026-11-05T14:38:40Z · cli_override
- 2026-11-05T14:38:41Z · cli_override
- 2026-11-06T01:51:13Z · status inbox→ready
