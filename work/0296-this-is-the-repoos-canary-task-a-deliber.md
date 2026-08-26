---
id: "0296"
title: Bump canary counter for end-to-end smoke test
type: chore
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-08-26T05:52:26Z"
updated_at: "2026-08-26T05:53:30Z"
---
## Problem

There is no deliberately trivial, low-risk change to use as a canary when smoke-testing the full RepoOS flow (draft, inbox, ready, active, review, merge, done) end to end. The `src/core/canary.ts` module exists exactly for this purpose but has not been exercised, so there is no lightweight, expected-to-succeed change to drive a full lifecycle against `main`.

## Desired UX

Running a canary task through every status in the RepoOS lifecycle (draft → inbox → ready → active → review → merge → done) succeeds cleanly against `main`, with `CANARY_COUNTER` reflecting the bumped value and `CANARY_PROMPT` unchanged — proving the flow works without any risk to real product behavior.

## Acceptance criteria

- [ ] `CANARY_COUNTER` in `src/core/canary.ts` is incremented by 1, wrapping from 9 back to 0.
- [ ] No other file is modified.
- [ ] `CANARY_PROMPT` is unchanged.
- [ ] No tests or comments are added beyond what already exists.
- [ ] `repoos check` passes.

## Notes for AI

- Only edit `src/core/canary.ts`.
- Increment the exported `CANARY_COUNTER` constant by exactly 1, wrapping from 9 back to 0.
- Do not touch `CANARY_PROMPT`.
- Do not add tests or comments; keep the change to the single constant value.
- This is intentionally trivial; do not expand scope.

## Original prompt

This is the repoos canary task: a deliberately trivial change used to smoke-test the full flow (draft, inbox, ready, active, review, merge, done) end to end. The only change to make is in src/core/canary.ts: increment the exported CANARY_COUNTER constant by 1, wrapping from 9 back to 0. Do not touch anything else, do not add tests or comments beyond what's already there, and do not change CANARY_PROMPT itself.

## Activity

- 2026-08-26T05:52:41Z · title, area, type, body
- 2026-08-26T05:53:12Z · pm_model_override
- 2026-08-26T05:53:17Z · review_model_override
- 2026-08-26T05:53:23Z · pm_model_override
- 2026-08-26T05:53:30Z · review_model_override
