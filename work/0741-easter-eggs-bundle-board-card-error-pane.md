---
id: "0741"
title: "Easter eggs bundle: board card error panel (flush, square, below the action button) and hide a stale close-out error while a new close-out runs"
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/easter-eggs-bundle-board-card-error-pane
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T16:19:09Z"
updated_at: "2026-10-07T17:42:21Z"
last_check_failure: "repoos check at 2026-10-07T16:36:48.254Z: ui verification failed (2 issue(s)): [missing-target] highlight .task-card .tc-card-footer matched nothing on / (captured http://127.0.0.1:50603/) (http://127.0.0.1:50603/); [missing-target] highlight .task-card .tc-card-footer matched nothing on / (captured http://127.0.0.1:50603/) (http://127.0.0.1:50603/)"
---
## Problem

Seen 2026-10-07 on a Review card (#0737): the action button 'Moving to done…' has square corners, but the failure message panel under it ('Leftover debug appendFileSync in tasks.ts broke 43 tests — …' with a Fix button) is a rounded box floating below the card with a gap, which looks detached from the card and clashes with the square buttons.

Also, that message was STALE: it came from an earlier failed close-out attempt (the engineer had since removed the tracing: tasks.ts on the branch has no appendFileSync and the pipeline was already in 'check' with failed:false), but it stayed on the card while the new close-out ran, which reads as 'it failed again'.

## Items (one commit each, one test each)

1. Error panel styling: render the card's error/notice panel directly below the primary action button as part of the card footer: no outer gap, no rounded corners (square like the action buttons), same border/background tokens as the footer, full card width; the inner 'Fix' button also square and flush. Keep it readable on narrow cards and in both themes (theme-contrast guard must pass). Use the existing card footer/action classes and style.css variants; no bespoke colours.
2. Stale error: when a close-out job for the task is queued or active (GET /api/integration/pipeline: active.taskId or queue contains it) and its failure message predates the job start, hide or dim the old message and show 'Previous attempt failed: <short>' collapsed behind a disclosure, so a running retry reads as running. The message returns if the new attempt fails.
3. The Fix button must stay disabled (with its tooltip) while a close-out is running for that task.

## Acceptance criteria

- Component tests for each item (class/DOM assertions, a snapshot of the panel structure, stale-vs-fresh error). Screenshot of the card footer in light and dark declared in ## Shots (route /, highlight the card footer). repoos check passes.

## Notes for AI

Read src/ui-app/src/components/TaskCard.vue (footer, the error block with the Fix action) and its styles; follow the AGENTS.md conventions (shared components, no native title tooltips). This is an easter eggs bundle: keep each item as its own small commit. Related: #0740 (card label for the integrating job); do not duplicate it.

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

- 2026-10-07T16:19:09Z · created · unknown
- 2026-10-07T16:19:10Z · needs_input
- 2026-10-07T16:19:12Z · cli_override, model_override
- 2026-10-07T16:19:14Z · status inbox→ready
- 2026-10-07T16:19:15Z · status ready→active, needs_input, branch
- 2026-10-07T16:22:18Z · body: section Shots
- 2026-10-07T16:23:08Z · body
- 2026-10-07T16:24:06Z · body
- 2026-10-07T16:31:54Z · body: section Shots
- 2026-10-07T16:32:44Z · body
- 2026-10-07T16:35:08Z · body
- 2026-10-07T16:36:44Z · note: ui verification failed (2 issue(s)): [missing-target] highlight .task-card .tc-card-footer matched nothing on / (captured http://127.0.0.1:50603/) (http://127.0.0.1:50603/); [missing-target] highlight .task-card .tc-card-footer matched nothing on / (captured http://127.0.0.1:50603/) (http://127.0.0.1:50603/)
- 2026-10-07T16:38:47Z · body: section Shots
- 2026-10-07T16:39:44Z · body
- 2026-10-07T16:41:27Z · body
- 2026-10-07T16:49:15Z · handoff failed · check failed after 2 automatic retries · ui verification: capture of / failed — waitFor: Timeout 5000ms exceeded.
- 2026-10-07T16:49:15Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-07T16:55:10Z · watchdog: escalated to needs_input · check-failed-after-retries · check failed after 2 automatic retries · ui verification: capture of / failed — waitFor: Timeout 5000ms exceeded. · next step: the agent stalled or timed out — see DEFAULT_STALL_TIMEOUT_MS in src/server/agents.ts
- 2026-10-07T17:41:17Z · body: section Shots
- 2026-10-07T17:41:17Z · needs_input
- 2026-10-07T17:42:21Z · handoff failed · ui-review handoff failed at verify · ui verification: capture of / failed — goto: Timeout 30000ms exceeded.
