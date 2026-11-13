---
id: "1102"
title: "Flaky test: 'ReferenceError: Element is not defined' in jsdom tests fails checks for unrelated tasks (seen on #1062, #1075, #1078, #1081)"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-13T07:11:46Z"
updated_at: "2026-11-13T07:11:54Z"
---
## Problem
repoos check intermittently fails with `ReferenceError: Element is not defined`. It appears in the agent logs of #1062, #1075, #1078 and #1081, tasks that touch unrelated code. The likely source is a jsdom MutationObserver callback delivered in a microtask after the environment is torn down (activity-motion-coordinator.test.ts and the overlay-occlusion code from #1062). #1081's engineer worked around it by stubbing the global Element in that test; that was reverted.

## Acceptance criteria
- Find the observer or listener that runs after teardown and disconnect it in the code or the test cleanup; no global stubs.
- Reproduce by running the whole ui-app suite repeatedly (or under load) before and after.

## Notes for AI
Grep agent logs for the stack. Do not raise timeouts or stub globals.

## Desired UX
No user-facing change: checks on unrelated tasks stop failing with a jsdom teardown error.

## Activity

- 2026-11-13T07:11:46Z · created · t@t
- 2026-11-13T07:11:46Z · needs_input
- 2026-11-13T07:11:54Z · body: Desired UX (added)
