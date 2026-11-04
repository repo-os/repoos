---
id: 1033
title: "Hold dialog: styled fields, optional reason, and held-card padding"
type: bug
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/hold-dialog-styled-fields-optional-reaso
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-11-04T13:14:03Z"
updated_at: "2026-11-04T23:49:19Z"
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
