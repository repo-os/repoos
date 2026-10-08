---
id: "0743"
title: UI verification at handoff must not fail a task because a declared shot targets UI that only exists in a state the preview board lacks
type: bug
status: done
priority: p1
area: [server, web]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
merged_commit: 2b3e63f0d75baf5bf1fb5108ed2dd7c3369a7f64
assigned_to: ai
created_by: ""
branch: feat/ui-verification-at-handoff-must-not-fail
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-08T14:06:36Z"
updated_at: "2026-10-08T14:46:32Z"
last_close_out_gate_ms: 219434
last_close_out_gate_at: "2026-10-08T14:46:22.477Z"
review_passes: 1
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

## Shots
```json
[
{
"label": "Board",
"target": "default",
"route": "/"
}
]
```

## Activity

- 2026-10-08T14:06:36Z · created · unknown
- 2026-10-08T14:06:41Z · cli_override, model_override
- 2026-10-08T14:06:43Z · status inbox→ready
- 2026-10-08T14:06:44Z · status ready→active, branch
- 2026-10-08T14:07:13Z · agent exited with an error (cursor) · RetriableError: [resource_exhausted] Error
- 2026-10-08T14:09:19Z · needs_input
- 2026-10-08T14:17:48Z · body
- 2026-10-08T14:19:07Z · body
- 2026-10-08T14:19:57Z · body: section Shots
- 2026-10-08T14:24:43Z · handoff failed · remote validation failed: remote validation failed (exit 1) — [lock] slot 0 acquired after 0s
[validate] cloning bundle /Users/peckjachowski/.repoos-0743-f171cd11.bundle
Note: switching to '36ab3693165cfd5ed559c021b614f11f2628cfa4'.
You are in 'detached HEAD' state. You can look around, make experimental
changes and commit them, and you can discard any commits you make in this
state without impacting any branches by switching back to a branch.
If you want to create a new branch to retain commits you create, you may
do so (now or later) by using -c with the switch command. Example:
git switch -c <new-branch-name>
Or undo this operation with:
git switch -
Turn off this advice by setting config variable advice.detachedHead to false
[validate] HEAD verified at 36ab3693165cfd5ed559c021b614f11f2628cfa4
bun install v1.4.2 (744846f84)
error: EACCES accessing temporary directory. Please set $BUN_TMPDIR or $BUN_INSTALL
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-08T14:32:08Z · note: ui verification failed (1 issue(s)): [missing-target] highlight .ibar-wrap matched nothing on / (captured http://127.0.0.1:55450/) (http://127.0.0.1:55450/)
- 2026-10-08T14:32:09Z · handoff failed · ui-review handoff failed at verify · ui verification failed (1 issue(s)): [missing-target] highlight .ibar-wrap matched nothing on / (captured http://127.0.0.1:55450/) (http://127.0.0.1:55450/)
- 2026-10-08T14:35:13Z · body: section Shots
- 2026-10-08T14:36:03Z · status active→review
- 2026-10-08T14:37:26Z · note: review pass 1: good to go
- 2026-10-08T14:46:22Z · close-out gate completed in 219s
- 2026-10-08T14:46:32Z · status review→done, release:success
