---
id: "1142"
title: "Android Hub: system back gesture should return from tailnet discovery"
type: bug
status: review
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: 2ce14031
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: feat/android-hub-system-back-gesture-should-r
created_at: "2026-11-16T14:01:00Z"
updated_at: "2026-11-16T14:10:42Z"
---
## Problem
On the Android Hub Find servers on my tailnet screen, the Android system back swipe does not return to Servers. The on-screen Servers back button is visible. The attached screenshot shows the signed-out discovery state.

## Acceptance criteria
- The Android system back action returns to the server picker from tailnet discovery, including signed-out and error states.
- Preserve normal back navigation on other Hub screens and avoid unexpectedly exiting the app.
- Add focused automated coverage for the back action and relevant navigation states.

## Notes for AI
Inspect the existing navigation and native back behavior before implementing. The screenshot is from the user’s Android phone; avoid claiming real-device verification unless actually observed.

## Screenshots

![1000072319](/api/tasks/1142/attachments/att_a5a15251-618d-47c7-bb62-5659c26f31b2.png)

## Activity

- 2026-11-16T14:01:00Z · created · t@t
- 2026-11-16T14:01:00Z · screenshots
- 2026-11-16T14:01:01Z · needs_input
- 2026-11-16T14:01:14Z · needs_input, body: Problem (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-16T14:01:32Z · status inbox→ready
- 2026-11-16T14:01:33Z · status ready→active, branch
- 2026-11-16T14:07:51Z · body
- 2026-11-16T14:10:42Z · status active→review
