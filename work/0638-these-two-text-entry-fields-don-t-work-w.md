---
id: "0638"
title: Fix unresponsive text entry fields in web UI
type: bug
status: active
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: The reviewer sent this back to the engineer 2 times and still found issues. Human review needed.
priority: p1
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-unresponsive-text-entry-fields-in-we
cli_override: opencode
model_override: openrouter/openrouter/pareto-code
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-03T10:29:31Z"
updated_at: "2026-10-03T13:55:12Z"
review_passes: 3
review_rounds: 2
---
## Problem
Two text entry fields in the web UI are completely non-functional. Clicking them produces no cursor, no focus state, and typing does nothing. This blocks any input through these fields.

## Desired UX
Clicking either field shows a visible cursor and focus ring; typing inserts text normally; the fields behave like standard interactive text inputs.

## Acceptance criteria
- [ ] Identify the two broken text entry fields
- [ ] Clicking each field activates focus and shows a cursor
- [ ] Typing into each field inserts text correctly
- [ ] No console errors when interacting with the fields

## Notes for AI
Assumption: "two text entry fields" refers to input/textarea elements in the web UI (`src/ui-app`); exact selectors and page unknown from the brief description — locate them by inspecting for uninteractive or disabled-looking text fields. Do not change unrelated fields. If the root cause is a CSS `pointer-events`, missing event binding, or disabled attribute, fix only what's blocking interaction. Do not invent new fields or redesign layouts.

## Scope
Covers restoring interactivity to the two mentioned text fields only. Defers broader form validation or accessibility audits unless directly related.

## Related
None provided.

## Original prompt

These two text entry fields don't work, when I click on them nothing happens, there's no cursor and I can't type anything.

## Screenshots

![Screenshot-2026-10-03-at-18.28.12](/api/tasks/0638/attachments/screenshot-1.png)
![Screenshot-2026-10-03-at-18.26.44](/api/tasks/0638/attachments/screenshot-2.png)

## Shots
```json
[
  {
    "label": "Area picker free-text input takes focus and typing (was dead)",
    "target": "default",
    "route": "/work?task=0638",
    "highlight": "input[aria-label=\"Add a custom area\"]",
    "steps": [
      {
        "waitMs": 700
      },
      {
        "click": ".drawer-tabs .tab-btn:first-child"
      },
      {
        "waitMs": 200
      },
      {
        "click": "#et-area"
      },
      {
        "waitMs": 300
      },
      {
        "fill": "input[aria-label=\"Add a custom area\"]",
        "text": "web"
      },
      {
        "waitMs": 200
      }
    ]
  }
]
```

## Activity

- 2026-10-03T10:29:31Z · created · hello@repoos.org
- 2026-10-03T10:29:33Z · screenshots
- 2026-10-03T10:29:33Z · screenshots
- 2026-10-03T10:29:47Z · status draft→inbox, title, priority, area, type, body
- 2026-10-03T10:41:36Z · cli_override, model_override
- 2026-10-03T10:41:38Z · model_override
- 2026-10-03T10:41:50Z · status inbox→ready
- 2026-10-03T10:41:52Z · status ready→active, branch
- 2026-10-03T11:03:33Z · note: CTO nudge attempted: engineer session stalled (no output since 10:53Z, ~10m); runner rejected the completion reminder with 'agent is busy' — turn appears hung mid-verification (full UI test suite). Flagged to human: pause/resume the session or wait.
- 2026-10-03T11:29:07Z · body: section Shots
- 2026-10-03T11:34:14Z · status active→review
- 2026-10-03T11:35:38Z · status review→active
- 2026-10-03T11:44:39Z · status active→review
- 2026-10-03T11:45:58Z · status review→active
- 2026-10-03T12:16:15Z · status active→review
- 2026-10-03T12:17:37Z · needs_input
- 2026-10-03T13:28:05Z · review_cli_override
- 2026-10-03T13:28:07Z · review_model_override
- 2026-10-03T13:30:12Z · status review→active
- 2026-10-03T13:30:12Z · note: Fixing review findings: AreaPicker focus style, ui-smoke error matching
- 2026-10-03T13:55:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
