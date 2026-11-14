---
id: "1114"
title: Build mobile task details as a page or sheet
type: feature
status: active
priority: p1
area: web
depends_on: ["1113"]
assigned_to: ai
created_by: t@t
branch: feat/build-mobile-task-details-as-a-page-or-s
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T09:10:53Z"
updated_at: "2026-11-14T15:25:25Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-14T15:22:47.288Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Mobile task detail page (target \"default\"): highlight [data-testid=\"mobile-task-detail\"] matched nothing on /work?task=9999 (http://127.0.0.1:35655/work?shotState=card:noChanges)"
---
## Problem
The desktop task drawer shares a narrow viewport with the Work board and its tabs/actions are cramped on phones.

## Desired UX
Opening a task from mobile Work presents readable task details in a mobile page or sheet and returns to the same queue state.

## Acceptance criteria
- Present task details in a dedicated mobile composition, reusing shared task data, store and mutations.
- Make title, status, task metadata, description and available actions readable and touch-usable without hover-only controls.
- Browser Back and in-app return return to Work with filter, sort and scroll position preserved.
- Any overlay is body-teleported and marked with data-overlay-layer; use shared dialog conventions.
- Keep desktop task drawer unchanged.
- Cover opening/closing, mutation/error states and preserved queue state; confirm no horizontal overflow.
## Notes for AI
Read ADR 0011 and coordinate with #1113's route and queue state. Follow shared dialog and overlay rules. Do not duplicate task business logic or alter desktop drawer behavior.

## Shots
```json
[
{
"label": "Mobile task detail page",
"target": "default",
"route": "/work",
"highlight": "[data-testid=\"mobile-task-detail\"]",
"steps": [
  {
    "click": "[data-task-id=\"9999\"] .mobile-task-card"
  }
],
"state": "card:noChanges"
}
]
```

## Activity

- 2026-11-14T09:10:53Z · created · t@t
- 2026-11-14T09:10:55Z · needs_input
- 2026-11-14T09:11:42Z · depends_on, body: Desired UX (added); Acceptance criteria (added 2, removed 2); Notes for AI (added); Desired outcome (removed)
- 2026-11-14T09:22:35Z · needs_input
- 2026-11-14T15:04:27Z · cli_override, model_override
- 2026-11-14T15:04:30Z · status inbox→ready
- 2026-11-14T15:04:32Z · status ready→active, branch
- 2026-11-14T15:09:36Z · body
- 2026-11-14T15:11:43Z · body
- 2026-11-14T15:16:03Z · note: ui verification failed: ui verification failed (3 issue(s)): [request] HTTP 404 for http://127.0.0.1:40047/api/tasks/9999 (http://127.0.0.1:40047/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:40047/api/tasks/9999); [missing-target] Mobile task detail page (target "default"): highlight [data-testid="mobile-task-detail"] matched nothing on /work?task=9999&state=card:noChanges (http://127.0.0.1:40047/work?task=9999&state=
- 2026-11-14T15:16:03Z · message_queued at 2026-11-14T15:16:03.980Z
- 2026-11-14T15:16:07Z · message_delivered: 1 message(s)
- 2026-11-14T15:16:41Z · body
- 2026-11-14T15:19:15Z · body
- 2026-11-14T15:22:42Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Mobile task detail page (target "default"): highlight [data-testid="mobile-task-detail"] matched nothing on /work?task=9999 (http://127.0.0.1:35655/work?shotState=card:noChanges)
- 2026-11-14T15:22:43Z · message_queued at 2026-11-14T15:22:43.174Z
- 2026-11-14T15:22:46Z · message_delivered: 1 message(s)
- 2026-11-14T15:23:22Z · note: adopted orphaned engineer pid 61829
- 2026-11-14T15:23:55Z · body
- 2026-11-14T15:25:25Z · body
