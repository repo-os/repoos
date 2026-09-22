---
id: "0483"
title: Bump canary counter by 1
type: chore
status: active
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: feat/bump-canary-counter-by-1
review_model_override: opencode-go/hy3
created_at: "2026-09-22T14:36:07Z"
updated_at: "2026-09-22T14:37:21Z"
---
## Problem

RepoOS needs a canary task to smoke-test its own full task flow — draft, inbox, ready, active, review, merge, done — end to end. This is that canary: a deliberately trivial change whose purpose is not the change itself but riding the entire lifecycle to prove the pipeline works. The one change to make is in `src/core/canary.ts`: increment the exported `CANARY_COUNTER` constant by 1, wrapping from 9 back to 0.

## Desired UX

When the task completes, the only visible delta is `CANARY_COUNTER` sitting exactly one higher than before (cycling 0–9, wrapping 9 → 0). Nothing else in the product changes. The real outcome is process-level: the task has traversed every lifecycle stage and landed in `done` via merge, confirming the flow works.

## Acceptance criteria

- [ ] `src/core/canary.ts` is the only file changed
- [ ] The exported `CANARY_COUNTER` constant is incremented by exactly 1, wrapping from 9 back to 0
- [ ] `CANARY_PROMPT` is unchanged
- [ ] No tests or comments are added beyond what's already there
- [ ] The task traverses the full flow end to end: draft → inbox → ready → active → review → merge → done

## Notes for AI

- Touch only `src/core/canary.ts`; the entire diff should be the counter bump.
- Read the current value of `CANARY_COUNTER`, then set it to `(current + 1) mod 10` — if it is currently 9, set it to 0.
- Do NOT change `CANARY_PROMPT` or any other export in the file.
- Do not add tests, comments, or doc changes. The change is deliberately trivial; any extra edit defeats the canary's purpose.
- Assumptions (not specified by the user): type `chore`, priority `p2`, and area `core` were chosen as reasonable defaults.

## Scope

Covers the single-constant bump in `src/core/canary.ts` and normal passage through the full task lifecycle. Deferred: everything else — no tests, no comments, no refactors, no other files.

## Original prompt

This is the repoos canary task: a deliberately trivial change used to smoke-test the full flow (draft, inbox, ready, active, review, merge, done) end to end. The only change to make is in src/core/canary.ts: increment the exported CANARY_COUNTER constant by 1, wrapping from 9 back to 0. Do not touch anything else, do not add tests or comments beyond what's already there, and do not change CANARY_PROMPT itself.

## Activity

- 2026-09-22T14:36:07Z · created · hello@repoos.org
- 2026-09-22T14:36:26Z · review_model_override
- 2026-09-22T14:36:46Z · status draft→inbox, title, area, type, body
- 2026-09-22T14:37:18Z · status inbox→ready
- 2026-09-22T14:37:21Z · status ready→active, branch
