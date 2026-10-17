---
updated_at: "2026-10-17T11:29:35Z"
review_passes: 2
id: "0817"
title: "Update requirements on an active task: edit action, and an automatic engineer notice on body changes"
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/update-requirements-on-an-active-task-ed
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-17T09:07:43Z"
review_rounds: 1
last_check_failure: "repoos check at 2026-10-17T09:56:09.589Z: repoos check failed: the worktree changed while the gate was running (appeared: src/server/requirements-notice.ts) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
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
"label": "Update requirements action on active task spec header (light)",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": "[data-test-id=\"update-requirements\"]",
"state": "drawer:activeRequirements",
"theme": "light"
},
{
"label": "Update requirements editor open (light)",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".sm-modal",
"steps": [
{
"waitFor": "[data-test-id=\"update-requirements\"]"
},
{
"click": "[data-test-id=\"update-requirements\"]"
},
{
"waitMs": 400
}
],
"state": "drawer:activeRequirements",
"theme": "light"
},
{
"label": "Update requirements editor open (dark)",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".sm-modal",
"steps": [
{
"waitFor": "[data-test-id=\"update-requirements\"]"
},
{
"click": "[data-test-id=\"update-requirements\"]"
},
{
"waitMs": 400
}
],
"state": "drawer:activeRequirements",
"theme": "dark"
}
]
```

## Activity

- 2026-10-17T09:07:43Z · created · njachowski@gmail.com
- 2026-10-17T09:11:25Z · status inbox→ready
- 2026-10-17T09:11:31Z · status ready→active, branch
- 2026-10-17T09:16:43Z · message_queued at 2026-10-17T09:16:43.896Z
- 2026-10-17T09:16:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-17T09:19:08Z · cli_override, model_override
- 2026-10-17T09:29:00Z · body
- 2026-10-17T09:29:57Z · body
- 2026-10-17T09:32:05Z · body: section Shots
- 2026-10-17T09:33:48Z · body
- 2026-10-17T09:46:45Z · message_delivered: 1 message(s)
- 2026-10-17T09:46:46Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-10-17T09:47:43Z · body
- 2026-10-17T09:49:21Z · body: section Shots
- 2026-10-17T09:57:23Z · body
- 2026-10-17T09:57:43Z · body
- 2026-10-17T09:59:02Z · body
- 2026-10-17T09:59:30Z · body
- 2026-10-17T10:00:18Z · body
- 2026-10-17T10:08:19Z · status active→review
- 2026-10-17T10:08:37Z · note: highlight [data-test-id="update-requirements"] matched nothing on /work?task=0817&tab=details
- 2026-10-17T10:08:57Z · note: waitFor [data-test-id="update-requirements"]: waitFor: Timeout 5000ms exceeded. on /work?task=0817&tab=details
- 2026-10-17T10:08:57Z · note: click [data-test-id="update-requirements"]: click: Timeout 5000ms exceeded. on /work?task=0817&tab=details
- 2026-10-17T10:08:57Z · note: highlight .sm-modal matched nothing on /work?task=0817&tab=details
- 2026-10-17T10:09:19Z · note: review pass 1: needs some work
- 2026-10-17T10:09:20Z · status review→active
- 2026-10-17T10:09:23Z · note: waitFor [data-test-id="update-requirements"]: waitFor: Timeout 5000ms exceeded. on /work?task=0817&tab=details
- 2026-10-17T10:09:24Z · note: click [data-test-id="update-requirements"]: click: Timeout 5000ms exceeded. on /work?task=0817&tab=details
- 2026-10-17T10:09:24Z · note: highlight .sm-modal matched nothing on /work?task=0817&tab=details
- 2026-10-17T10:11:20Z · body: section Shots
- 2026-10-17T10:12:02Z · message_queued at 2026-10-17T10:12:02.080Z
- 2026-10-17T10:21:57Z · message_queued at 2026-10-17T10:21:57.954Z
- 2026-10-17T10:33:55Z · message_queued at 2026-10-17T10:33:55.906Z
- 2026-10-17T10:42:10Z · message_queued at 2026-10-17T10:42:10.543Z
- 2026-10-17T11:12:01Z · message_queued at 2026-10-17T11:12:01.568Z
- 2026-10-17T11:12:01Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-17T11:25:44Z · status active→review
- 2026-10-17T11:25:45Z · note: handoff requested (cli)
- 2026-10-17T11:25:55Z · handoff failed · task-file handoff failed at commit · could not clear the staging index: fatal: Unable to create '/Users/nick/code/nick/repoos/.git/worktrees/update-requirements-on-an-active-task-ed/index.lock': File exists. · Another git process seems to be running in this repository, or the lock file may be stale
- 2026-10-17T11:26:36Z · message_delivered: 1 message(s)
- 2026-10-17T11:27:42Z · body
- 2026-10-17T11:28:24Z · status active→review
- 2026-10-17T11:28:45Z · note: highlight [data-test-id="update-requirements"] matched nothing on /work?task=9999&tab=details
- 2026-10-17T11:29:09Z · note: waitFor [data-test-id="update-requirements"]: waitFor: Timeout 5000ms exceeded. on /work?task=9999&tab=details
- 2026-10-17T11:29:09Z · note: click [data-test-id="update-requirements"]: click: Timeout 5000ms exceeded. on /work?task=9999&tab=details
- 2026-10-17T11:29:09Z · note: highlight .sm-modal matched nothing on /work?task=9999&tab=details
- 2026-10-17T11:29:33Z · note: waitFor [data-test-id="update-requirements"]: waitFor: Timeout 5000ms exceeded. on /work?task=9999&tab=details
- 2026-10-17T11:29:34Z · note: click [data-test-id="update-requirements"]: click: Timeout 5000ms exceeded. on /work?task=9999&tab=details
- 2026-10-17T11:29:34Z · note: highlight .sm-modal matched nothing on /work?task=9999&tab=details
- 2026-10-17T11:29:34Z · note: review pass 2: needs some work

