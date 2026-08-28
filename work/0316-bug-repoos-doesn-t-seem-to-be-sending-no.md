---
id: "0316"
title: Fix notifications not sending and permission prompts not appearing
type: bug
status: active
priority: p1
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-notifications-not-sending-and-permis
created_at: "2026-08-28T11:41:43Z"
updated_at: "2026-08-28T11:44:37Z"
---
## Problem

Notifications feature is non-functional: when users toggle notifications on in settings, the app neither requests the necessary permissions from the browser or macOS nor sends any notifications afterward. Users hit no permission dialog, get no notifications, and have no signal that anything is wrong.

## Desired UX

When a user enables notifications in settings:
1. The app immediately requests browser/OS notification permissions (browser permission dialog or macOS system prompt)
2. After granting permission, notifications are delivered as intended
3. The user has clear feedback about whether notifications are working

## Acceptance criteria

- [ ] Browser notification permission prompt appears when notifications are toggled on in settings
- [ ] macOS notification permission prompt appears when notifications are toggled on in settings
- [ ] Notifications are successfully sent after permissions are granted
- [ ] Both browser and macOS notification delivery are verified working
- [ ] The end-to-end flow (toggle → permission prompt → notification sent) works

## Notes for AI

- Investigate why the permission request isn't being triggered on the settings toggle
- Check if notification sending is wired up at all or if both the permission flow and delivery are broken
- Assume permission requests should happen immediately when the toggle is switched on
- Both browser and macOS paths need to be fixed; if they use different code paths, ensure both are covered

## Scope

**Covers:** Getting the notification permission flow and delivery working end-to-end for both browser and macOS

**Deferred:** Notification content refinements, notification preferences/filtering, or UX polish beyond basic functionality

## Original prompt

Bug: RepoOS doesn't seem to be sending notifications (browser or mac) and it didnt' ask me for permission either when I toggled it on in the settings.

## Activity

- 2026-08-28T11:42:01Z · status draft→inbox, title, priority, area, type, body
- 2026-08-28T11:44:03Z · status inbox→ready
- 2026-08-28T11:44:37Z · status ready→active, branch
