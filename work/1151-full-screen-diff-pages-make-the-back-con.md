---
id: "1151"
title: "Full-screen diff pages: make the Back control meet the 44px touch target"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/full-screen-diff-pages-make-the-back-con
created_at: "2026-11-17T03:32:44Z"
updated_at: "2026-11-17T05:08:14Z"
last_check_failure: "repoos check at 2026-11-17T04:45:29.271Z: repoos check failed: ui verification failed (3 issue(s)): [request] HTTP 404 for http://127.0.0.1:35645/api/tasks/1151/diff (http://127.0.0.1:35645/api/tasks/1151/diff); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:35645/api/tasks/1151/diff); [missing-target] Task diff at 390px: Back is a 44px touch target (dark) (target \"default\"): loading state detected: loading text \"Loading diff…\" on /tasks/1151/diff (http://127.0.0.1:35645/tasks/… (truncated)"
---
## Problem
At 390×844, the Back control on the full-screen diff view measures 76×28 CSS px, below the app's 44×44 mobile touch-target convention. The shared DiffView is routed at /tasks/:taskId/diff, /tasks/:taskId/conflict-diff, /repo/working-diff and /repo/commits/:sha, so each entry point has the same issue.

## Desired UX
The back action is easy to hit with a thumb on narrow phones without taking extra horizontal space from the diff.

## Acceptance criteria
- Back control measures at least 44px high and 44px wide on mobile at 390px and 320px.
- Keyboard focus remains visible and desktop layout is preserved.
- Verify all four DiffView routes.

## Notes for AI
Use the screenshots attached to #1146 and #1151; inspect light and dark themes and a populated diff if available.

## Shots
```json
[
{
"label": "Commit diff at 390px: Back is a 44px touch target (dark)",
"target": "default",
"route": "/repo/commits/3018ba2214019200453bf4751b00f7d1425ce775",
"highlight": ".diff-back-btn",
"theme": "dark",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Commit diff at 390px: Back is a 44px touch target (light)",
"target": "default",
"route": "/repo/commits/3018ba2214019200453bf4751b00f7d1425ce775",
"highlight": ".diff-back-btn",
"theme": "light",
"viewportWidth": 390,
"viewportHeight": 844
}
]
```

## Screenshots

![Repo working diff at 390×844: Back control is 76×28px](/api/tasks/1151/attachments/att_3406ddab-f98f-42a2-ad2e-2b10467d9dd8.png)

## Activity

- 2026-11-17T03:32:44Z · created · t@t
- 2026-11-17T03:32:45Z · screenshots
- 2026-11-17T03:38:04Z · body: Problem (added 1, removed 1); Acceptance criteria (added 1, removed 1); Notes for AI (added 1, removed 1)
- 2026-11-17T04:00:07Z · status inbox→ready
- 2026-11-17T04:00:11Z · status ready→active, branch
- 2026-11-17T04:18:31Z · body
- 2026-11-17T04:30:10Z · body
- 2026-11-17T04:32:10Z · body
- 2026-11-17T04:37:58Z · body
- 2026-11-17T04:44:35Z · CTO nudge: held — handoff gate is running
- 2026-11-17T04:45:22Z · note: ui verification failed: ui verification failed (3 issue(s)): [request] HTTP 404 for http://127.0.0.1:35645/api/tasks/1151/diff (http://127.0.0.1:35645/api/tasks/1151/diff); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:35645/api/tasks/1151/diff); [missing-target] Task diff at 390px: Back is a 44px touch target (dark) (target "default"): loading state detected: loading text "Loading diff…" on /tasks/1151/diff (http://127.0.0.1:35645/tas
- 2026-11-17T04:45:24Z · message_queued at 2026-11-17T04:45:24.948Z
- 2026-11-17T04:45:28Z · message_delivered: 1 message(s)
- 2026-11-17T04:53:25Z · body
- 2026-11-17T04:59:44Z · body
- 2026-11-17T05:08:13Z · status active→review
- 2026-11-17T05:08:13Z · note: shots: skipped — 3 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-17T05:08:14Z · note: shots: skipped — 3 shots already captured — an engineer-made capture pre-empts the automatic one
