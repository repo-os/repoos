---
id: "1286"
title: "Hub server list: pull down to refresh"
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-23T07:50:31Z"
updated_at: "2026-11-23T07:50:33Z"
---
## Goal
On the mobile Hub app's server list (mobile/src/components/ServerListView.vue), support pull-down-to-refresh so the user can re-check every server's reachability without killing and reopening the app.

## Requirements
- Pulling down at the top of the server list triggers the same status refresh the list does on open.
- A subtle, native-feeling refresh indicator shows while refreshing; it ends when all servers have reported (or timed out).
- Works on Android and iOS (Capacitor webviews); must not conflict with normal list scrolling or the row menus.
- No other new UI beyond the pull indicator.
- Add a test and update user-docs/android-hub.md if it lists refresh behaviour.

## Screenshots
See attached: all servers show Unreachable with no way to refresh.
![Hub server list; no way to refresh without killing the app](/api/tasks/1286/attachments/att_9f072a6c-b94d-4e4b-a821-aaa4a39b5c35.png)

## Activity

- 2026-11-23T07:50:31Z · created · t@t
- 2026-11-23T07:50:32Z · screenshots
- 2026-11-23T07:50:33Z · needs_input
