---
id: "0743"
title: UI verification at handoff must not fail a task because a declared shot targets UI that only exists in a state the preview board lacks
type: bug
status: active
priority: p1
area: [server, web]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/ui-verification-at-handoff-must-not-fail
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-08T14:06:36Z"
updated_at: "2026-10-08T14:17:48Z"
dev_error_count: 1
---
## Problem

On 2026-10-07 UI verification failed the handoff of #0692, #0741 and #0740 (and escalated #0741 to needs_input after the automatic retry cap) because their declared shots highlighted or waited for elements that only exist while something is happening: '.ibar-wrap' (the pipeline bar renders only during a close-out), '.task-card .tc-hint.tc-moving' and '[data-test-id=task-card-action-footer]' (need a card in a particular state), and a 5 s waitFor on such an element. The preview board is empty, so 'missing-target' / 'waitFor timeout' became a handoff FAILURE for correct code. Each cost 10-20 minutes and a driver edit (replace the shot with a plain '/' capture). A fourth failure ('Could not connect to the server' x4 on /api/models) looks like two UI handoffs evicting each other's single preview (capped at ONE, #0271).

## Desired UX

- A declared shot whose highlight/selector/waitFor target is missing is recorded as a visible WARNING with the screenshot still captured (never a handoff failure). Console/page errors and failed requests from the app itself still fail verification.
- Support seeding state for conditional UI: a shot entry may carry a 'state' (e.g. a named fixture such as 'closeOut:active', 'card:doneError', 'board:withReviewTask') that the preview applies before capture, so the screenshot actually shows the thing being changed. Start with 2-3 fixtures that cover tonight's cases (active close-out, done-error card, review card).
- Two concurrent UI verifications never evict each other: queue the verification for the single preview slot (or give each its own port) and say 'waiting for the preview slot' instead of failing; a 'Could not connect to the server' mid-capture retries once on a fresh preview.
- AGENTS.md shot guidance (the Shots paragraph) is updated: prefer routes and fixtures; a missing target is a warning.

## Acceptance criteria

- Tests: missing highlight target -> warning + capture, handoff passes; app console error -> failure; fixture applies state; two concurrent verifications queue instead of failing; one retry on preview disconnect. Docs (docs/, user-docs/running-with-agents.md, AGENTS.md shots paragraph). repoos check passes.

## Notes for AI

Read the handoff UI verification gate (src/server/ui-handoff-gate.ts, #0680), the shot capture (src/server/shots.ts, src/commands/shot.ts) and the preview manager (#0271). Related: #0694, #0603, #0613.

## Activity

- 2026-10-08T14:06:36Z · created · unknown
- 2026-10-08T14:06:41Z · cli_override, model_override
- 2026-10-08T14:06:43Z · status inbox→ready
- 2026-10-08T14:06:44Z · status ready→active, branch
- 2026-10-08T14:07:13Z · agent exited with an error (cursor) · RetriableError: [resource_exhausted] Error
- 2026-10-08T14:09:19Z · needs_input
- 2026-10-08T14:17:48Z · body
