---
id: "0936"
title: UI handoff gate hides the runner's real shot failure ('runner result omitted the UI verification record')
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T19:57:21Z"
updated_at: "2026-10-22T19:57:21Z"
---
## Problem
src/server/ui-handoff-gate.ts importRemoteVerification throws 'runner result omitted the UI verification record' whenever the runner's verification.json is missing and the result is not skipped. 2026-10-22, #0929: two handoffs failed with exactly that text, three times in the transcript, while the runner's result.detail (and partial shots) held the real failure. The engineer only saw the generic text and had to guess which of 3 declared shots broke. Each wrong guess costs a ~10 minute handoff.

## Desired UX
When verification.json is missing and result.ok is false, surface result.detail (the per-shot failure: which shot, which selector, which step) in the handoff-failed note and the task activity. Keep the 'omitted the record' wording only when the result itself carries no detail. Per-shot failures list target, route, selector and the step that missed.

## Acceptance criteria
- Test: runner result {ok:false, detail:'shot 2: .delete-confirm-modal matched nothing'} without verification.json produces an error containing that detail.
- Test: a result with no detail keeps the current wording.
- docs/debugging-check-failures.md mentions where to read the per-shot failure.

## Notes for AI
Related: AGENTS.md shot hygiene (#0613, #0830) and #0866.

## Activity

- 2026-10-22T19:57:21Z · created · njachowski@gmail.com
