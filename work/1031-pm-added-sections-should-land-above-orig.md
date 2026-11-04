---
id: 1031
title: PM-added sections should land above Original prompt and Screenshots
type: bug
status: ready
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-04T12:03:10Z"
updated_at: "2026-11-04T17:44:27Z"
---
## Problem

`replaceSection` (src/core/task.ts) inserts a brand-new `## Heading` immediately before `## Activity`. On a freeform task the body is: raw prompt, `## Original prompt`, `## Screenshots`, `## Activity`. So when the PM agent adds Problem / Desired UX / Acceptance criteria / Notes for AI, they land BELOW the long Original prompt and screenshots and the user scrolling the task panel thinks nothing was fleshed out (seen on #1030, 2026-11-04).

## Desired behaviour

A newly created section (any heading other than Original prompt, Screenshots, Activity) is inserted before the first of `## Original prompt` / `## Screenshots` / `## Activity` that exists, so the fleshed-out spec reads first and the raw capture + images sit at the bottom. Re-replacing an existing section stays in place. Sections added one at a time keep their order (Problem, Desired UX, Acceptance criteria, Notes for AI).

## Acceptance criteria

1. Unit tests in the replaceSection suite: new section lands above Original prompt/Screenshots; sequential adds keep order; existing section replaced in place; body with only Activity behaves as today.
2. Existing tests pass; no change to how Original prompt / Screenshots / Activity themselves are placed.

## Notes for AI

Change is in `replaceSection` (insertAt computation). Also check the PM prompt in src/server/freeform.ts does not assume the old order.

## Activity

- 2026-11-04T12:03:10Z · created · njachowski@gmail.com
- 2026-11-04T17:44:20Z · model_override
- 2026-11-04T17:44:27Z · status inbox→ready
