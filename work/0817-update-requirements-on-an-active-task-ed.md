---
id: "0817"
title: "Update requirements on an active task: edit action, and an automatic engineer notice on body changes"
type: feature
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/update-requirements-on-an-active-task-ed
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-17T09:07:43Z"
updated_at: "2026-10-17T12:47:26Z"
last_check_failure: "repoos check at 2026-10-17T12:30:07.605Z: repoos check failed: ui verification failed (6 issue(s)): [request] HTTP 404 for http://127.0.0.1:60495/api/tasks/9999 (http://127.0.0.1:60495/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:60495/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:60495/api/tasks/9999 (http://127.0.0.1:60495/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:6… (truncated)"
review_passes: 3
review_rounds: 2
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
"steps": [
{
  "waitFor": "[data-test-id=\"update-requirements\"]"
}
],
"state": "drawer:activeRequirements",
"theme": "light"
},
{
"label": "Update requirements action on active task (dark)",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": "[data-test-id=\"update-requirements\"]",
"steps": [
{
  "waitFor": "[data-test-id=\"update-requirements\"]"
}
],
"state": "drawer:activeRequirements",
"theme": "dark"
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
  "waitFor": ".sm-modal"
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
  "waitFor": ".sm-modal"
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
- 2026-10-17T11:29:35Z · message_queued at 2026-10-17T11:29:35.265Z
- 2026-10-17T11:29:35Z · status review→active
- 2026-10-17T11:31:32Z · message_queued at 2026-10-17T11:31:32.394Z
- 2026-10-17T11:35:01Z · message_delivered: 2 message(s)
- 2026-10-17T11:36:54Z · body: section Shots
- 2026-10-17T11:37:48Z · body
- 2026-10-17T11:39:10Z · body
- 2026-10-17T11:45:29Z · handoff failed · remote validation failed: test failure: tests/task-underspecified-flag.test.ts > underspecified flag on body edit (#0613) > raises needs_input when a later body edit leaves spec sections empty on bee — fix it in the feature branch and re-run the gate
- 2026-10-17T11:47:07Z · body
- 2026-10-17T11:48:30Z · body
- 2026-10-17T11:49:05Z · status active→review
- 2026-10-17T11:49:23Z · note: highlight [data-test-id="update-requirements"] matched nothing on /work?task=9999&tab=details
- 2026-10-17T11:49:37Z · note: highlight [data-test-id="update-requirements"] matched nothing on /work?task=9999&tab=details
- 2026-10-17T11:50:01Z · note: waitFor [data-test-id="update-requirements"]: waitFor: Timeout 5000ms exceeded. on /work?task=9999&tab=details
- 2026-10-17T11:50:01Z · note: click [data-test-id="update-requirements"]: click: Timeout 5000ms exceeded. on /work?task=9999&tab=details
- 2026-10-17T11:50:01Z · note: highlight .sm-modal matched nothing on /work?task=9999&tab=details
- 2026-10-17T11:50:21Z · note: waitFor [data-test-id="update-requirements"]: waitFor: Timeout 5000ms exceeded. on /work?task=9999&tab=details
- 2026-10-17T11:50:21Z · note: click [data-test-id="update-requirements"]: click: Timeout 5000ms exceeded. on /work?task=9999&tab=details
- 2026-10-17T11:50:21Z · note: highlight .sm-modal matched nothing on /work?task=9999&tab=details
- 2026-10-17T11:50:29Z · note: review pass 3: needs some work
- 2026-10-17T11:50:29Z · needs_input
- 2026-10-17T11:55:23Z · status review→active
- 2026-10-17T11:55:30Z · needs_input
- 2026-10-17T11:55:30Z · message_queued at 2026-10-17T11:55:30.438Z
- 2026-10-17T11:56:18Z · body
- 2026-10-17T12:04:17Z · note: ui verification failed (8 issue(s)): [request] HTTP 404 for http://127.0.0.1:57950/api/tasks/9999 (http://127.0.0.1:57950/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:57950/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:57950/api/tasks/9999 (http://127.0.0.1:57950/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:57950/api/tasks/9999);
- 2026-10-17T12:04:17Z · handoff failed · check failed after 2 automatic retries · ui verification failed (8 issue(s)): [request] HTTP 404 for http://127.0.0.1:57950/api/tasks/9999 (http://127.0.0.1:57950/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:57950/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:57950/api/tasks/9999 (http://127.0.0.1:57950/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:57950/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:57950/api/tasks/9999 (http://127.0.0.1:57950/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:57950/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:57950/api/tasks/9999 (http://127.0.0.1:57950/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:57950/api/tasks/9999)
- 2026-10-17T12:04:53Z · message_delivered: 1 message(s)
- 2026-10-17T12:05:23Z · message_queued at 2026-10-17T12:05:23.833Z
- 2026-10-17T12:05:40Z · body: section Shots
- 2026-10-17T12:05:52Z · body: section Shots
- 2026-10-17T12:06:54Z · body
- 2026-10-17T12:08:18Z · body
- 2026-10-17T12:16:25Z · note: ui verification failed (6 issue(s)): [request] HTTP 404 for http://127.0.0.1:59126/api/tasks/9999 (http://127.0.0.1:59126/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:59126/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:59126/api/tasks/9999 (http://127.0.0.1:59126/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:59126/api/tasks/9999);
- 2026-10-17T12:16:28Z · message_delivered: 1 message(s)
- 2026-10-17T12:19:22Z · body
- 2026-10-17T12:20:15Z · body
- 2026-10-17T12:22:01Z · body
- 2026-10-17T12:30:04Z · note: ui verification failed (6 issue(s)): [request] HTTP 404 for http://127.0.0.1:60495/api/tasks/9999 (http://127.0.0.1:60495/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:60495/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:60495/api/tasks/9999 (http://127.0.0.1:60495/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:60495/api/tasks/9999);
- 2026-10-17T12:32:36Z · body
- 2026-10-17T12:40:46Z · note: ui verification failed (6 issue(s)): [request] HTTP 404 for http://127.0.0.1:61545/api/tasks/9999 (http://127.0.0.1:61545/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:61545/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:61545/api/tasks/9999 (http://127.0.0.1:61545/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:61545/api/tasks/9999);
- 2026-10-17T12:40:46Z · handoff failed · check failed after 2 automatic retries · ui verification failed (6 issue(s)): [request] HTTP 404 for http://127.0.0.1:61545/api/tasks/9999 (http://127.0.0.1:61545/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:61545/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:61545/api/tasks/9999 (http://127.0.0.1:61545/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:61545/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:61545/api/tasks/9999 (http://127.0.0.1:61545/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:61545/api/tasks/9999)
- 2026-10-17T12:43:26Z · message_queued at 2026-10-17T12:43:26.858Z
- 2026-10-17T12:44:04Z · body
- 2026-10-17T12:44:43Z · body: section Shots
- 2026-10-17T12:46:29Z · body
- 2026-10-17T12:47:26Z · body
