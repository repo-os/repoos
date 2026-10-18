---
id: "0830"
title: "Handoff: a shot whose waitFor/click/highlight target is missing fails the handoff (add hover step and fixture list)"
type: feature
status: inbox
priority: p2
area: core
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T08:09:25Z"
updated_at: "2026-10-18T08:09:25Z"
---
## Problem
When a declared shot's `waitFor`, `click` or `highlight` target is missing, the capture only records a note ("capture went ahead") and the handoff still passes. A review round then discovers blank or wrong captures, and after 3 rounds the task parks with `review-rounds-exhausted` (#0822, #0829). The step vocabulary also has no `hover`, so tooltip shots (e.g. the integration median tooltip) cannot be declared.

## Desired UX
- At handoff, a declared shot with a failed step or unmatched highlight fails the handoff with a clear per-shot message (route, step, selector), leaving the task active so the engineer fixes the plan in the same turn.
- A `hover` step is supported alongside click/fill/waitFor/waitMs.
- The engineer prompt lists the known `state` fixtures (from `src/core/shot-fixtures.ts`) and says tooltip/hover and popover shots need a `hover` or `click` step plus a fixture that seeds the data.
- Auto-captured (undeclared) shots keep today's lenient behaviour.

## Acceptance criteria
- Test: a declared shot with a timed-out waitFor fails handoff, naming the shot; fixing it passes.
- Test: `hover` step works and is validated by `--shots`.
- Test: undeclared auto captures never fail the handoff.
- docs/previews.md and user-docs updated.

## Notes for AI
Related: #0734, #0755, #0613. Do not make a missing Playwright a failure (stays a visible skip). Source: driver discussion 2026-10-18.

## Activity

- 2026-10-18T08:09:25Z · created · njachowski@gmail.com
