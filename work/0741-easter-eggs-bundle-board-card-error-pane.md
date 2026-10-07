---
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-07T16:31:19.608Z: ui verification: capture of / failed — click: Timeout 5000ms exceeded."
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
updated_at: "2026-10-07T16:24:06Z"
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
    "label": "Board card flush square done-error footer (light)",
    "target": "default",
    "route": "/",
    "highlight": ".task-card[data-status=review] .tc-card-footer, .task-card .tc-done-error"
  },
  {
    "label": "Board card done-error footer (dark)",
    "target": "default",
    "route": "/",
    "highlight": ".task-card .tc-card-footer",
    "steps": [
      {
        "click": "button[data-test-id=theme-toggle]"
      },
      {
        "waitMs": 200
      }
    ]
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

