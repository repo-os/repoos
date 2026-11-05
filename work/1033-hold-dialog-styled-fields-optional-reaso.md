---
id: 1033
title: "Hold dialog: styled fields, optional reason, and held-card padding"
type: bug
status: review
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/hold-dialog-styled-fields-optional-reaso
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-11-04T13:14:03Z"
updated_at: "2026-11-05T01:02:57Z"
last_check_failure: "repoos check at 2026-11-05T00:37:03.953Z: repoos check failed: ui verification failed (3 issue(s)): [missing-target] Hold dialog with outlined reason and date fields (target \"default\"): click [data-test-id=\"hold-task\"]: click: Timeout 5000ms exceeded. on /work?task=9999 (http://127.0.0.1:56676/work?shotState=drawer:reviewWithBranch); [missing-target] Hold dialog with outlined reason and date fields (target \"default\"): waitFor .cc-modal textarea.ff-textarea: waitFor: Timeout 5000ms exceeded. on /work?task=9999 (http://127.0.0.1:56676/wor… (truncated)"
---
## Problem

The Hold task dialog renders its Reason textarea and Auto-release date input with no visible field chrome: they read as plain text, unlike other textareas and date inputs in the app. The Hold task button is disabled until a reason is typed, but a reason is not needed to hold a task (the CLI treats `--reason` as optional). On the task panel, the 'Held — automation won't start this task' card has uneven, cramped padding between the text, the Release hold / Release and start buttons and the card edges.

## Desired UX

The Reason textarea and the date input use the shared rounded, outlined field styles (global `ff-textarea` and the form-field classes in `src/ui-app/src/style.css`), with a visible focus ring, matching other drawers and dialogs. The Hold task button is enabled with an empty reason, and the held card handles a missing reason without a blank row or the word 'pause'. The held card has even padding on all sides and consistent gaps between title, reason, byline and buttons.

## Acceptance criteria

1. Test: Hold task button is enabled with an empty reason and submits successfully.
2. Test: a held task with no reason renders the held card without an empty reason row.
3. Textarea and date input use shared field classes, no bespoke colors; hardcoded-colors and contrast guards pass in light and dark.
4. Declared `## Shots`: hold dialog and held card on the task panel.

## Notes for AI

Check the server hold route (`POST /api/tasks/:id/hold`) accepts an empty reason before relaxing the UI; keep CLI behavior unchanged. Use the shared `ui/dialog/*` components per AGENTS.md. Split out of easter-egg bundle #1026, which was at its size cap.

## Shots
```json
[
{
"label": "Hold dialog with outlined reason and date fields",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".cc-modal",
"steps": [
{
"click": ".drawer-tabs button.tab-btn:nth-child(1)"
},
{
"click": "[data-test-id=\"hold-task\"]"
},
{
"waitFor": ".cc-modal textarea.ff-textarea"
}
],
"state": "drawer:reviewWithBranch"
},
{
"label": "Held card with even padding on the task panel",
"target": "default",
"route": "/work?task=9999",
"highlight": ".held-panel",
"state": "drawer:held"
}
]
```

## Screenshots

![3](/api/tasks/1033/attachments/att_178cf1e9-1fcf-4154-b59a-71b2de4ba774.png)
![4](/api/tasks/1033/attachments/att_9c32932b-b3d6-4914-b4d9-91dcef57d3f4.png)
![5](/api/tasks/1033/attachments/att_9b931edb-87a4-481d-a0fb-e63b2ed45cc7.png)

## Activity

- 2026-11-04T13:14:03Z · created · njachowski@gmail.com
- 2026-11-04T13:14:04Z · screenshots
- 2026-11-04T23:49:03Z · status inbox→ready
- 2026-11-04T23:49:16Z · cli_override
- 2026-11-04T23:49:17Z · model_override
- 2026-11-04T23:49:19Z · status ready→active, branch
- 2026-11-04T23:54:13Z · body
- 2026-11-05T00:00:55Z · body
- 2026-11-05T00:05:44Z · body
- 2026-11-05T00:10:05Z · CTO nudge: held — handoff gate is running
- 2026-11-05T00:37:00Z · note: ui verification failed (3 issue(s)): [missing-target] Hold dialog with outlined reason and date fields (target "default"): click [data-test-id="hold-task"]: click: Timeout 5000ms exceeded. on /work?task=9999 (http://127.0.0.1:56676/work?shotState=drawer:reviewWithBranch); [missing-target] Hold dialog with outlined reason and date fields (target "default"): waitFor .cc-modal textarea.ff-textarea: waitFor: Timeout 5000ms exceeded. on /work?task=9999 (http://127.0.0.1:56676/work?shotState=drawer:re
- 2026-11-05T00:37:01Z · message_queued at 2026-11-05T00:37:01.153Z
- 2026-11-05T00:37:03Z · message_delivered: 1 message(s)
- 2026-11-05T00:38:12Z · body
- 2026-11-05T00:42:24Z · body
- 2026-11-05T00:50:05Z · CTO nudge: held — handoff gate is running
- 2026-11-05T01:02:57Z · status active→review
- 2026-11-05T01:02:57Z · message_queued at 2026-11-05T01:02:57.478Z
