---
id: "1142"
title: "Android Hub: system back gesture should return from tailnet discovery"
type: bug
status: inbox
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-16T14:01:00Z"
updated_at: "2026-11-16T14:01:00Z"
---
On the Android Hub Find servers on my tailnet screen, the Android system back swipe does not return to Servers. The on-screen Servers back button is visible. Make the Android system back gesture return to the server picker from discovery, including signed-out/error states, without disrupting normal server navigation or exiting unexpectedly. Inspect and handle the existing navigation and native back behavior; cover relevant states with focused tests. The attached screenshot is from the user’s phone. Verify device behavior if an authorized phone connection is available.

## Screenshots

![1000072319](/api/tasks/1142/attachments/att_a5a15251-618d-47c7-bb62-5659c26f31b2.png)

## Activity

- 2026-11-16T14:01:00Z · created · t@t
- 2026-11-16T14:01:00Z · screenshots
