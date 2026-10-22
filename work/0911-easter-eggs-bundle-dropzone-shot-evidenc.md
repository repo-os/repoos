---
id: "0911"
title: "Easter eggs bundle: dropzone shot evidence (Manual tab, default picker)"
type: feature
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-dropzone-shot-evidenc
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T01:34:32Z"
updated_at: "2026-10-22T17:47:15Z"
---
## Items
- [x] **E1 · Manual-tab handoff capture does not show a dropzone** (web) — #0899’s declared Manual-tab shot lacked a recorded assertion; the light and dark captures now assert the dropzone exists. Source: reviewer notes on #0899 (passes 4 and 5), 2026-10-22.
- [x] **E2 · TaskDrawer handoff shot shows the upload-failure state, not the default picker** (web) — added a state-fixture capture of the default upload picker beside the retained failure-state shot. Source: reviewer notes on #0899, 2026-10-22.
- [ ] **E3 · Debug-tab banner cards have no inner padding (red “Runner memory pressure” card and yellow queued / Sync with main notices)** (web) — deferred per human direction pending the additional screenshot upload; no implementation in this pass.
- [x] **E4 · Settings restart hint alignment** (web) — moved the restart-required hint before the control so controls keep a shared right edge, including on narrow rows.

## Problem
#0899 landed the dropzone layout fix, but its Manual-tab capture lacks an assertion and its TaskDrawer capture shows only the upload-failure state. Settings rows also place the restart-required hint after the control, pushing controls out of alignment.

## Desired UX
Reviewers can see the Manual-tab dropzone in light and dark themes, the default TaskDrawer upload picker beside the failure state, and Settings controls aligned at a shared right edge with restart hints before their controls.

## Acceptance criteria
- E1: the Manual-tab shot declares an assertion that the dropzone exists, and captures it in light and dark themes.
- E2: a TaskDrawer shot of the default picker is declared beside the failure-state shot, using a state fixture and no placeholder-selector click steps.
- E4: restart-required hints appear before their controls, controls share a right edge, and the hint remains readable and accessible on narrow widths.
- E1, E2, and E4 captures pass with zero console errors. E3 remains unchecked until the human uploads the additional screenshot.

## Notes for AI
See #0899 and its reviews under .repoos/reviews/0899/. Use repoos update --shots to declare shots. This bundle scope is E1, E2, and E4. E3 is intentionally deferred, remains unchecked, and requires the additional screenshot from the human before implementation.

## Shots
```json
[
{
"label": "Manual tab dropzone · light",
"target": "default",
"route": "/work",
"highlight": ".shot-dropzone",
"steps": [
{
"click": ".drawer-tabs .tab-btn:nth-child(2)"
}
],
"assert": [
{
"selector": ".shot-dropzone",
"label": "Screenshot dropzone is rendered"
}
],
"state": "panel:defaultScreenshotPicker",
"theme": "light"
},
{
"label": "Manual tab dropzone · dark",
"target": "default",
"route": "/work",
"highlight": ".shot-dropzone",
"steps": [
{
"click": ".drawer-tabs .tab-btn:nth-child(2)"
}
],
"assert": [
{
"selector": ".shot-dropzone",
"label": "Screenshot dropzone is rendered"
}
],
"state": "panel:defaultScreenshotPicker",
"theme": "dark"
},
{
"label": "Task drawer default screenshot picker",
"target": "default",
"route": "/work",
"highlight": ".shot-dropzone",
"assert": [
{
"selector": ".shot-dropzone",
"label": "Default screenshot picker is rendered"
}
],
"state": "panel:defaultScreenshotPicker"
},
{
"label": "Task drawer screenshot upload failure",
"target": "default",
"route": "/work",
"state": "panel:freeformFailedScreenshot"
},
{
"label": "Task browser work restart hint before control",
"target": "default",
"route": "/settings?tab=general&section=remote-validation",
"highlight": "[id=\"setting-remoteValidation.browserCaptureMode\"]",
"assert": [
{
"selector": "[id=\"setting-remoteValidation.browserCaptureMode\"] .restart-badge",
"label": "Restart hint is shown beside the setting",
"text": "restart required"
}
]
}
]
```

## Screenshots

![E3: Runner memory pressure red card has no inner padding (Debug tab)](/api/tasks/0911/attachments/att_6deb50f6-503c-49bf-9f05-c276f45e03a6.png)
![E4: restart required badge sits right of the control; move it left so controls are flush right](/api/tasks/0911/attachments/att_014c0836-9186-4e54-b605-03d73b0520d0.webp)
![E3: red and yellow cards in the Debug tab have no inner padding](/api/tasks/0911/attachments/att_ce2dc653-63e6-440e-94e9-53389721ead8.webp)

## Activity

- 2026-10-22T01:34:32Z · created · njachowski@gmail.com
- 2026-10-22T04:13:48Z · body: Items (added 1)
- 2026-10-22T04:13:54Z · screenshots
- 2026-10-22T04:25:26Z · body: Items (added 1)
- 2026-10-22T04:25:31Z · screenshots
- 2026-10-22T05:03:27Z · body: Items (added 1, removed 1)
- 2026-10-22T05:03:39Z · screenshots
- 2026-10-22T17:36:22Z · status inbox→ready
- 2026-10-22T17:36:27Z · cli_override, model_override
- 2026-10-22T17:36:27Z · status ready→active, branch
- 2026-10-22T17:36:30Z · message_queued at 2026-10-22T17:36:30.597Z
- 2026-10-22T17:36:30Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T17:37:23Z · body
- 2026-10-22T17:39:01Z · body
- 2026-10-22T17:40:25Z · body
- 2026-10-22T17:40:42Z · body
- 2026-10-22T17:40:45Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T17:40:45Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T17:40:45Z · message_delivered: 1 message(s)
- 2026-10-22T17:44:00Z · body: Notes for AI (added 1, removed 1)
- 2026-10-22T17:44:00Z · message_queued at 2026-10-22T17:44:00.340Z
- 2026-10-22T17:44:12Z · body
- 2026-10-22T17:44:25Z · body: Items (added 4, removed 4)
- 2026-10-22T17:44:25Z · message_queued at 2026-10-22T17:44:25.996Z
- 2026-10-22T17:44:35Z · body: Acceptance criteria (added 4, removed 3)
- 2026-10-22T17:44:35Z · message_queued at 2026-10-22T17:44:35.746Z
- 2026-10-22T17:46:09Z · body: Problem (added 1, removed 1)
- 2026-10-22T17:46:10Z · message_queued at 2026-10-22T17:46:10.212Z
- 2026-10-22T17:46:18Z · body: Desired UX (added 1, removed 1)
- 2026-10-22T17:46:19Z · message_queued at 2026-10-22T17:46:19.124Z
- 2026-10-22T17:47:15Z · CTO nudge: held — an undelivered message is already queued
