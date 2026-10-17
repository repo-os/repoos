---
updated_at: "2026-10-17T12:16:17Z"
review_passes: 4
id: "0817"
title: "Update requirements on an active task: edit action, and an automatic engineer notice on body changes"
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/update-requirements-on-an-active-task-ed
created_at: "2026-10-17T09:07:43Z"
---
## Problem
Requirements (the task body: Problem, Desired UX, Acceptance criteria, Notes) are changed on main while the task is active, but the engineer works from its own copy of the task file in its worktree. A change made on main is not seen by the engineer until someone tells it or it merges main. On #0816 the engineer had to work out what had changed, because the body edits only reached a message.

Requirements also get removed, not only added, so the action must cover both.

## Desired UX
- An 'Update requirements' action on an active task (in the task drawer). It opens the task body for editing, with the changed sections highlighted when saved. Saving records one activity entry that lists which sections changed (added, edited, or removed items), and sends the engineer a short message with the same summary and the changed sections.
- Any body change to an active task, including one made from the CLI or API, triggers the same engineer notice automatically, so nothing depends on someone remembering to send it.
- The engineer's worktree copy of the task file is not written by this action. The notice tells the engineer what changed; merging main or the next handoff brings the file in line.

## Acceptance criteria
- Test: saving a body change on an active task records one activity entry listing the changed sections, and sends the engineer one message with the same summary.
- Test: adding and removing an acceptance criterion both appear in the summary.
- Test: a body change made through the CLI on an active task sends the same notice.
- Test: a body change on a task that is not active does not send an engineer notice.
- Test: the worktree copy of the task file is not modified by this action.
- Light and dark themes checked on the action and the editor.

## Notes for AI
Start from the body-update route for tasks (src/server, grep for the task body PATCH and repoos update --body) and the engineer message path (repoos message). The summary is computed by comparing the old and new body by section. Keep the notice short: changed sections and the new text of added items. Use the shared dialog components for the editor (AGENTS.md). Source: user request 2026-10-17 after the #0816 engineer had to work out which requirements had changed.

## Shots
```json
[
{
"label": "Update requirements action on active task (light)",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": "[data-test-id=\"update-requirements\"]",
"state": "drawer:activeRequirements",
"theme": "light",
"steps": [
{
"waitFor": "[data-test-id=\"update-requirements\"]"
}
]
},
{
"label": "Update requirements action on active task (dark)",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": "[data-test-id=\"update-requirements\"]",
"state": "drawer:activeRequirements",
"theme": "dark",
"steps": [
{
"waitFor": "[data-test-id=\"update-requirements\"]"
}
]
},
{
"label": "Update requirements editor open (light)",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".sm-modal",
"state": "drawer:activeRequirements",
"theme": "light",
"steps": [
{
"waitFor": "[data-test-id=\"update-requirements\"]"
},
{
"click": "[data-test-id=\"update-requirements\"]"
},
{
"waitFor": ".sm-modal"
}
]
}
]
```

## Activity

- 2026-10-17T09:07:43Z · created · njachowski@gmail.com
- 2026-10-17T09:11:25Z · status inbox→ready
- 2026-10-17T09:11:31Z · status ready→active, branch
- 2026-10-17T10:08:19Z · status active→review
- 2026-10-17T10:09:18Z · note: review pass 1: good to go
- 2026-10-17T11:29:12Z · note: review pass 2: good to go
- 2026-10-17T11:49:51Z · note: review pass 3: good to go
- 2026-10-17T12:16:17Z · note: review pass 4: needs some work

