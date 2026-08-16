---
id: "0100"
title: Add task notification settings for state transitions requiring attention
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-task-notification-settings-for-state
created_at: "2026-08-11T16:18:32Z"
updated_at: "2026-08-16T14:30:31Z"
---
## Problem

Users are not alerted when tasks encounter state changes that require attention—such as moving to review, being paused, getting stuck, or needing human intervention. This means users may miss important transitions that demand their action.

## Desired UX

When a task transitions to a state requiring attention, RepoOS plays a bell sound on the user's computer and/or sends a push notification. Users can easily enable or disable notifications for each event type from the settings page.

Notification triggers include:
- Task transitions from `active` to `review`
- Task is paused (manually or due to an issue)
- Task becomes stuck (no progress detected)
- Task explicitly marked as needing human attention

## Acceptance criteria

- [ ] A bell sound plays when a task transitions to any monitored state and sound notifications are enabled.
- [ ] No bell sound plays when sound notifications are disabled.
- [ ] The settings page includes clearly labeled toggles for each notification type (review ready, paused, stuck, needs attention).
- [ ] The settings page includes a master toggle for sound notifications.
- [ ] The settings page includes a master toggle for push notifications.
- [ ] Push notifications are sent for monitored state transitions when push notifications are enabled.
- [ ] No push notifications are sent when push notifications are disabled.
- [ ] Individual notification types can be toggled independently.
- [ ] Notification settings persist across page reloads.
- [ ] Enabling push notifications handles the browser or operating system permission flow.
- [ ] Notifications only trigger on state transitions, not when a task is already in a monitored state.

## Notes for AI

- Treat "push notification" as a browser notification delivered through the computer's notification system.
- Assume all notification options are disabled by default.
- Keep all controls on the existing settings page.
- Use a bell-like sound for audible notifications.
- Monitored transitions: `active`→`review`, `active`→`paused`, detection of `stuck` state, and `needs-attention` flag.
- Trigger notifications only when a state change is detected, not on page load for existing states.
- Each notification type can be toggled independently (e.g., user may want review alerts but not paused alerts).

## Scope

This task covers bell sounds and browser push notifications for task state transitions that require user attention (review ready, paused, stuck, needs attention), plus their settings controls. Advanced customization (custom sounds, per-task notification rules) is deferred.

## Activity

- 2026-08-11T16:18:32Z · created · unknown
- 2026-08-11T16:19:20Z · status inbox→ready
- 2026-08-11T17:37:40Z · status ready→inbox
- 2026-08-11T17:37:43Z · status inbox→ready
- 2026-08-11T17:37:58Z · status ready→inbox
- 2026-08-11T19:14:59Z · status inbox→ready
- 2026-08-14T00:00:00Z · scope expanded to cover paused, stuck, and needs-attention transitions
- 2026-08-16T13:56:38Z · status ready→active, branch
- 2026-08-16T14:18:36Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-16T14:18:36Z · status review→active
