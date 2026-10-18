---
id: "0822"
title: "Easter eggs bundle: Start work shows a starting state and cannot be clicked twice"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T02:36:59Z"
updated_at: "2026-10-18T02:36:59Z"
---
## Problem
Clicking 'Start work' on a ready task does nothing visible until the server's status update reaches the browser and the card moves to Active. The button stays enabled in the meantime, so a second click is sent to the server and returns a red 'already working' warning. The UI has no pending state for the start (src/ui-app/src/stores/repo.ts, startWork, which just awaits the API call; the button is TaskCard.vue 'Start work').

## Desired UX
- On click, the card immediately shows a 'Starting…' or 'Moving to work' state with a small animation, and 'Start work' is disabled.
- The pending state clears when the task reaches Active, or when the request fails (then show the error and re-enable the button).
- The same applies to the drawer's start action.

## Acceptance criteria
- Test: clicking Start work once disables the button and shows the starting state until the task status changes to active.
- Test: a second click during the starting state does not send a second request.
- Test: a failed start clears the starting state and shows the error.
- Light and dark themes checked on the starting state; the animation respects reduced motion.

## Notes for AI
Start from startWork in src/ui-app/src/stores/repo.ts and the Start work button in src/ui-app/src/components/TaskCard.vue (and the drawer's start action). Keep a per-task pending set in the store. Source: user report 2026-10-18.

## Activity

- 2026-10-18T02:36:59Z · created · njachowski@gmail.com
