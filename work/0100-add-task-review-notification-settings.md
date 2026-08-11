---
id: "0100"
title: Add task review notification settings
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T16:18:32Z"
updated_at: "2026-08-11T19:14:59Z"
---
## Problem

Users are not alerted when a task moves from `active` to `review`, so they may miss that the task is ready for review.

## Desired UX

When a task transitions from `active` to `review`, RepoOS can play a bell sound on the user's computer. Users can easily enable or disable the sound from the settings page.

The settings page also provides an option to enable or disable push notifications for the same transition.

## Acceptance criteria

- [ ] A bell sound plays when a task transitions directly from `active` to `review` and sound notifications are enabled.
- [ ] No bell sound plays when sound notifications are disabled.
- [ ] The settings page includes a clearly labeled toggle for the bell sound.
- [ ] The settings page includes a clearly labeled toggle for push notifications.
- [ ] A push notification is sent when a task transitions directly from `active` to `review` and push notifications are enabled.
- [ ] No push notification is sent when push notifications are disabled.
- [ ] Notification settings persist across page reloads.
- [ ] Enabling push notifications handles the browser or operating system permission flow.
- [ ] Other task status transitions do not trigger these notifications.

## Notes for AI

- Treat “push notification” as a browser notification delivered through the computer's notification system.
- Assume both notification options are disabled by default.
- Keep both controls on the existing settings page.
- Use a bell-like sound for the audible notification.
- Trigger notifications only for a detected transition from `active` to `review`, not merely because a task is already in `review`.
- Do not add notifications for other task transitions.
- Do not add unrelated notification channels or notification customization.

## Scope

This task covers local bell and browser push notifications for the `active`-to-`review` transition, plus their settings controls. Other events, notification channels, and sound customization are deferred.

## Activity

- 2026-08-11T16:18:32Z · created · unknown
- 2026-08-11T16:19:20Z · status inbox→ready
- 2026-08-11T17:37:40Z · status ready→inbox
- 2026-08-11T17:37:43Z · status inbox→ready
- 2026-08-11T17:37:58Z · status ready→inbox
- 2026-08-11T19:14:59Z · status inbox→ready
