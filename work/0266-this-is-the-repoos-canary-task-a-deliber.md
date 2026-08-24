---
id: "0266"
title: Increment canary counter
type: chore
status: review
priority: p1
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: feat/increment-canary-counter
model_override: default
pm_model_override: default
created_at: "2026-08-24T15:10:15Z"
updated_at: "2026-08-24T15:15:00Z"
---
## Problem
This is the canary smoke test for the RepoOS workflow—a deliberately trivial change to verify that the full end-to-end flow works (draft, inbox, ready, active, review, merge, done).

## Desired UX
The CANARY_COUNTER constant in src/core/canary.ts is incremented by 1, wrapping from 9 back to 0. This minimal change flows through the complete task workflow.

## Acceptance criteria
- [ ] CANARY_COUNTER in src/core/canary.ts is incremented by 1
- [ ] Wrap-around works: 9 → 0
- [ ] Only src/core/canary.ts is modified
- [ ] CANARY_PROMPT is unchanged
- [ ] No tests are added
- [ ] No comments are added

## Notes for AI
- Modify only src/core/canary.ts
- Increment the exported CANARY_COUNTER constant by 1 with wrap-around from 9 to 0
- Do not modify CANARY_PROMPT
- Do not add tests or comments beyond what already exists

## Original prompt

This is the repoos canary task: a deliberately trivial change used to smoke-test the full flow (draft, inbox, ready, active, review, merge, done) end to end. The only change to make is in src/core/canary.ts: increment the exported CANARY_COUNTER constant by 1, wrapping from 9 back to 0. Do not touch anything else, do not add tests or comments beyond what's already there, and do not change CANARY_PROMPT itself.

## Activity

- 2026-08-24T15:10:49Z · status draft→inbox, title, priority, area, type, body
- 2026-08-24T15:11:23Z · status inbox→ready
- 2026-08-24T15:11:29Z · pm_model_override
- 2026-08-24T15:12:18Z · status ready→active, branch
- 2026-08-24T15:15:00Z · status active→review
