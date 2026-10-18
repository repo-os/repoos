---
id: "0831"
title: "Review: evidence-only gaps (shots) must not consume code-review rounds or park the task"
type: feature
status: done
priority: p2
area: core
merged_commit: e4fbf7c2f4280d8ef29d076dfe138578cd5e835a
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/review-evidence-only-gaps-shots-must-not
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T08:09:30Z"
updated_at: "2026-10-18T09:05:39Z"
last_close_out_gate_ms: 80216
last_close_out_gate_at: "2026-10-18T08:49:32.952Z"
review_passes: 1
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
- 2026-10-18T08:18:44Z · status inbox→ready
- 2026-10-18T08:18:48Z · cli_override, model_override
- 2026-10-18T08:18:50Z · status ready→active, branch
- 2026-10-18T08:22:37Z · body
- 2026-10-18T08:24:29Z · body
- 2026-10-18T08:27:03Z · body
- 2026-10-18T08:34:19Z · status active→review
- 2026-10-18T08:35:08Z · note: review pass 1: good to go
- 2026-10-18T08:42:29Z · body
- 2026-10-18T08:48:10Z · close-out gate completed in 87s
- 2026-10-18T08:49:32Z · close-out gate completed in 80s
- 2026-10-18T08:50:09Z · status review→done, release:success
- 2026-10-18T09:04:34Z · body
- 2026-10-18T09:05:39Z · body
