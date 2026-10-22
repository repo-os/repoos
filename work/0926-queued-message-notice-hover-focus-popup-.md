---
id: "0926"
title: "Queued-message notice: hover/focus popup showing the queued message text"
type: feature
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/queued-message-notice-hover-focus-popup-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-22T06:59:28Z"
updated_at: "2026-10-22T17:06:01Z"
review_rounds: 1
review_passes: 1
last_check_failure: "repoos check at 2026-10-22T16:45:14.389Z: repoos check failed: remote validation unavailable: host thinkpad skipped: link probe failed — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally"
---
## Problem
The chat shows 'Queued — will be read when the current turn ends.' (src/ui-app/src/components/ChatQueuedNotice.vue) with no way to see WHAT is queued. Automatic board-change notes and CTO nudges queue too, so the viewer cannot tell a requirements update from a nudge. Example 2026-10-22: #0918 showed the notice for 75 min with no indication it was a harmless notes update.

## Desired UX
Hovering or keyboard-focusing the notice opens a styled popover (shared tooltip/popover component, not a native title; works on touch via tap) listing each queued message: source (you / CTO nudge / board update), queued-at time and age, and the message text, scrollable and truncated with a 'show more'. If several are queued, show them in order. Use a plain-language label such as 'Waiting for the engineer's current turn to end'. The data already exists server-side (.repoos/queued-messages.json); expose it read-only on the task's API if the UI does not have it.

## Acceptance criteria
- Hover and focus open the popover; Escape or blur closes it.
- Touch tap toggles it.
- Test: notice with 2 queued messages renders both with source and time; empty queue shows no notice.
- Does not use native title tooltips.

## Notes for AI
Follow the AGENTS.md conventions for tooltips/popovers and body-teleported layers (data-overlay-layer). Separate small cleanup, not in scope: entries for finished tasks in queued-messages.json are never delivered; see #0924 notes.

## Shots
```json
[
{
"label": "Queued notice popover with message details",
"target": "default",
"route": "/work?task=0821&tab=agent",
"highlight": "[data-test-id=chat-queued-note]",
"steps": [
{
"hover": "[data-test-id=chat-queued-note]"
},
{
"waitMs": 300
}
],
"state": "drawer:queuedMessage"
}
]
```

## Activity

- 2026-10-22T06:59:28Z · created · njachowski@gmail.com
- 2026-10-22T15:53:18Z · status inbox→ready
- 2026-10-22T15:53:28Z · cli_override, model_override
- 2026-10-22T15:53:29Z · status ready→active, branch
- 2026-10-22T15:58:07Z · body
- 2026-10-22T15:59:52Z · body
- 2026-10-22T16:02:10Z · body
- 2026-10-22T16:11:17Z · handoff failed · remote validation failed: test failure: tests/chat-queued-send.test.ts > chat queued state > shows the shared queued wording while a message waits, tests/chat-queued-send.test.ts > chat queued state > lists two queued messages with source and time in the popover on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T16:16:20Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/chat-queued-send.test.ts > chat queued state > shows the shared queued wording while a message waits, tests/chat-queued-send.test.ts > chat queued state > lists two queued messages with source and time in the popover on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-22T16:16:20Z · note: handoff requested (cli)
- 2026-10-22T16:24:40Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/chat-queued-send.test.ts > chat queued state > shows the shared queued wording while a message waits, tests/chat-queued-send.test.ts > chat queued state > lists two queued messages with source and time in the popover on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T16:32:17Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/chat-queued-send.test.ts > chat queued state > shows the shared queued wording while a message waits, tests/chat-queued-send.test.ts > chat queued state > lists two queued messages with source and time in the popover on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T16:39:26Z · body
- 2026-10-22T16:41:30Z · body
- 2026-10-22T16:44:25Z · body
- 2026-10-22T16:47:09Z · body
- 2026-10-22T17:04:53Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-10-22T17:04:54Z · status active→review
- 2026-10-22T17:06:01Z · note: review pass 1: needs some work
- 2026-10-22T17:06:01Z · status review→active
