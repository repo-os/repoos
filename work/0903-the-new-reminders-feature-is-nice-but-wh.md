---
id: "0903"
title: Show due reminders as header cards beside alerts
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-due-reminders-as-header-cards-besid
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-10-21T15:04:49Z"
updated_at: "2026-10-22T01:15:35Z"
---
## Problem

When a reminder comes due, it only appears inside the alerts popup on the top-right bell. That popup also holds many other alerts, so a due reminder is easy to miss.

## Desired UX

When a reminder is due, show it in a new reminders section in the header, immediately to the left of the alerts icon. Each due reminder is a small card with a short bit of the reminder’s text, outlined in a bright color so it stands out. The user can dismiss a card, or click it to open the reminders page and see more about that reminder. Due reminders should be obvious here rather than buried in the alerts list.

## Acceptance criteria

- [ ] Due reminders appear as cards in the header, to the left of the alerts icon.
- [ ] Each card shows a short excerpt of the reminder text and is outlined in a bright color.
- [ ] The user can dismiss a card so it no longer sits in that header section.
- [ ] Clicking a card opens the reminders page with more information about that reminder.
- [ ] A due reminder is visible in this section without opening the alerts popup.

## Notes for AI

- Header alerts live in `src/ui-app/src/components/NoticeBell.vue`; due reminders are `reminderDue` notices built in `src/ui-app/src/stores/notices.ts` from `src/ui-app/src/stores/reminders.ts`. The reminders UI is `src/ui-app/src/components/RemindersPanel.vue` (Agents).
- Assumption: only reminders whose time has come (the same due set that currently feeds the alerts popup) appear as cards, not upcoming ones.
- Assumption: several due reminders are several cards, each with its own dismiss and click.
- Assumption: dismiss hides that due card from the header and does not delete the reminder. Click goes to the existing reminders surface focused on that reminder.
- Assumption: “a bit of text” is a truncated excerpt of the reminder text, not the full body.
- Assumption: “bright color” means a high-visibility outline using an existing theme token so it stays obvious in light and dark. Do not hard-code a color.
- Use the shared tooltip/dialog patterns if any control needs an explanation. Do not add a native `title` tooltip.
- Add or extend a UI test around the header cards (dismiss and navigation). Declare a review shot of the header with a due reminder if the change is visible there.

## Scope

This covers the header cards for due reminders: excerpt, bright outline, dismiss, and click-through to the reminders page. It does not change how reminders are stored, scheduled, or edited.

## Original prompt

The new reminders feature is nice, but when the time comes it just shows in the alerts icon popup at the top right, which is easy to miss since there are many other alerts that go in there. What we should do instead is make a new reminders section next to that alerts icon (to the left of it) which show a bit of text about the reminder and have it very obvious, outlined in a bright color like little cards which the user can dismiss or click on to go to the reminders page to see more info about the reminder.

## Screenshots

![Screenshot-2026-10-21-at-23.00.20](/api/tasks/0903/attachments/att_b4b66eb0-eebc-42ac-b34c-d0401b273051.png)

## Activity

- 2026-10-21T15:04:49Z · created · hello@repoos.org
- 2026-10-21T15:04:54Z · screenshots
- 2026-10-21T15:05:30Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-10-21T15:06:08Z · status inbox→ready
- 2026-10-21T15:33:19Z · model_override
- 2026-10-22T01:11:42Z · cli_override, model_override
- 2026-10-22T01:11:47Z · cli_override, model_override
- 2026-10-22T01:11:50Z · model_override
- 2026-10-22T01:15:35Z · status ready→active, branch
