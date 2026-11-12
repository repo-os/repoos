---
id: "1089"
title: "Easter eggs bundle: release in progress shows the activity animation (Releases page and Cut a release panel)"
type: feature
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-release-in-progress-s
created_at: "2026-11-11T03:47:02Z"
updated_at: "2026-11-12T01:08:27Z"
deferred_handoff_resume_count: 1
---
## Problem
While a release is being cut (v0.5.82 on 2026-11-11), the Releases page shows a static "RELEASING..." pill and the "Cut a release" panel shows "Step 4 of 7 · Running checks · 2m 05s elapsed" with a log box. Nothing on either moves, so it looks stalled for the 20-30 minutes a release takes. Task cards and the Settings preview already show the user's chosen activity animation (the ActivityIndicator, the footprint/art styles with size and style settings) while work is running.

## Desired UX
Show the same ActivityIndicator, honouring the same style, size and reduced-motion settings, next to "RELEASING..." on the Releases page and at the top of the Cut a release panel's progress block while a release run is in the running state; stop it when the run succeeds or fails. Reuse the component and the useActivityMotion pause-when-not-visible behaviour (see #1062); do not add new animation code or settings.

## Acceptance criteria
1. ReleasesView.vue: the RELEASING... pill and the "View progress" row show the indicator while the release run state is `running`; hidden otherwise.
2. The Cut a release panel (progress block, "Step N of M") shows the indicator while running.
3. Honours the existing activity-animation style/size settings and prefers-reduced-motion (static art), and pauses when the page or panel is not visible.
4. Test: renders the indicator when the run is running and not when idle, succeeded or failed.
5. Declared shots (state fixture) of the Releases page and panel in the running state, light and dark.
6. Files: src/ui-app/src/views/ReleasesView.vue, src/ui-app/src/components/ActivityIndicator.vue, lib/activity-motion. Do not edit repoos.toml.

## Shots
```json
[
{
"label": "Releases page: releasing pill with activity (light)",
"target": "default",
"route": "/releases",
"highlight": "[data-test-id=\"release-phase-pill\"]",
"state": "release:cutRunning",
"theme": "light"
},
{
"label": "Releases page: releasing pill with activity (dark)",
"target": "default",
"route": "/releases",
"highlight": "[data-test-id=\"release-phase-pill\"]",
"state": "release:cutRunning",
"theme": "dark"
},
{
"label": "Cut release drawer: step heading with activity (light)",
"target": "default",
"route": "/releases?drawer=cut",
"highlight": "[data-test-id=\"release-cut-progress-heading\"]",
"state": "release:cutRunning",
"theme": "light"
},
{
"label": "Cut release drawer: step heading with activity (dark)",
"target": "default",
"route": "/releases?drawer=cut",
"highlight": "[data-test-id=\"release-cut-progress-heading\"]",
"state": "release:cutRunning",
"theme": "dark"
}
]
```

## Screenshots

![Releases page while releasing](/api/tasks/1089/attachments/att_43bfb230-b674-4d17-b9fe-42456f211829.webp)
![Cut a release panel](/api/tasks/1089/attachments/att_850ba332-403a-4a36-8608-5f1b2f527af1.png)

## Activity

- 2026-11-11T03:47:02Z · created · njachowski@gmail.com
- 2026-11-11T03:47:03Z · screenshots
- 2026-11-11T03:47:03Z · needs_input
- 2026-11-12T00:15:11Z · status inbox→ready
- 2026-11-12T00:15:14Z · status ready→active, needs_input, branch
- 2026-11-12T00:15:29Z · message_queued at 2026-11-12T00:15:29.479Z
- 2026-11-12T00:18:15Z · body
- 2026-11-12T00:18:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T00:33:59Z · body
- 2026-11-12T00:59:12Z · body
- 2026-11-12T01:08:26Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-12T01:08:26Z · message_queued at 2026-11-12T01:08:26.919Z
- 2026-11-12T01:08:27Z · ↻ resuming engineer to read queued message
- 2026-11-12T01:08:27Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Implementing UI changes, shot fixture, tests, and declarations. · stderr: (empty)
- 2026-11-12T01:08:27Z · message_delivered: 2 message(s)
