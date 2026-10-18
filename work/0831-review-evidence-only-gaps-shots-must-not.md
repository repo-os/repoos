---
id: "0831"
title: "Review: evidence-only gaps (shots) must not consume code-review rounds or park the task"
type: feature
status: inbox
priority: p2
area: core
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T08:09:30Z"
updated_at: "2026-10-18T08:09:30Z"
---
## Problem
The reviewer returns "needs some work" for missing or wrong screenshot evidence even when the code is fine (#0829 pass 3, #0822 passes 1-4). Each such verdict counts as a review round, bounces the engineer, and after MAX_AUTO_REVIEW_ROUNDS raises `review-rounds-exhausted` so the task waits for a human, although the engineer has no code to change.

## Desired UX
- The review report separates code findings from evidence gaps (a distinct verdict such as `good to go — evidence missing`, or a separate "Evidence" field).
- Code good + evidence gap: the task does not count a round and is not parked; instead an evidence step runs (re-capture from the declared plan, and if shots still fail, a cheap shots agent or a clear single request to the engineer limited to the shot plan).
- Code findings keep today's behaviour and round counting.

## Acceptance criteria
- Test: an evidence-only verdict does not increment the round count nor set review-rounds-exhausted.
- Test: a code finding still counts and still bounces.
- Test: after the evidence step fails twice, the task is flagged needs_input with the specific missing shots.
- docs/close-out-pipeline.md or docs/previews.md updated.

## Notes for AI
Design-heavy: write the decision into docs before coding; keep the reviewer prompt change small. Related: #0173 (auto-bounce), #0060007f8. Source: driver discussion 2026-10-18.

## Activity

- 2026-10-18T08:09:30Z · created · njachowski@gmail.com
