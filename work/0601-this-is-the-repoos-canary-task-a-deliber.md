---
id: "0601"
title: Bump canary counter by 1
type: chore
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: cursor
model_override: composer-2.5
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-30T12:47:15Z"
updated_at: "2026-09-30T12:49:07Z"
---
## Problem

RepoOS needs a canary task to smoke-test its own full task flow — draft, inbox, ready, active, review, merge, done — end to end. This is that canary: a deliberately trivial change whose purpose is not the change itself but riding the entire lifecycle to prove the pipeline works. The one change to make is in `.repoos/canary.txt`: replace the single digit with the next value, incrementing by 1 and wrapping from 9 back to 0.

## Desired UX

When the task completes, the only visible delta is the counter file sitting exactly one digit higher than before (cycling 0–9, wrapping 9 → 0). Nothing else in the product changes. The real outcome is process-level: the task has traversed every lifecycle stage and landed in `done` via merge, confirming the flow works.

## Acceptance criteria

- [ ] `.repoos/canary.txt` is the only file changed
- [ ] The file contains a single digit, incremented by exactly 1 from its value at task start (wrap 9 → 0)
- [ ] The canary freeform prompt text (`CANARY_PROMPT` / task marker) is unchanged in source
- [ ] No tests, comments, or doc edits
- [ ] The task traverses the full flow end to end: draft → inbox → ready → active → review → merge → done

## Notes for AI

- Touch only `.repoos/canary.txt`; the entire diff should be the one-character bump.
- Read the current digit in that file, then write `(current + 1) mod 10` as the sole file content (one digit, no extra whitespace or newline churn beyond what git already tracks).
- Do NOT edit `src/core/canary.ts`, `CANARY_PROMPT`, or any other path.
- Do not add tests, comments, or formatting-only edits elsewhere. Extra scope defeats the canary.
- Counter at task authoring time on `main` is `3` → set to `4` unless the branch was cut later and the file already moved.

## Scope

Covers the single-digit bump in `.repoos/canary.txt` and normal passage through the full task lifecycle. Deferred: everything else — no tests, no comments, no refactors, no other files.

## Original prompt

This is the RepoOS canary task: a deliberately trivial change used to smoke-test the full flow (draft, inbox, ready, active, review, merge, done) end to end. The only change to make is in .repoos/canary.txt: replace the single digit with the next value, incrementing by 1 and wrapping from 9 back to 0. Do not touch anything else, do not add tests or comments, and do not change the canary prompt text.

## Activity

- 2026-09-30T12:47:15Z · created · hello@repoos.org
- 2026-09-30T12:47:22Z · cli_override
- 2026-09-30T12:47:23Z · model_override
- 2026-09-30T12:47:25Z · review_cli_override
- 2026-09-30T12:47:26Z · review_model_override
- 2026-09-30T12:47:27Z · status draft→inbox
- 2026-09-30T12:47:27Z · needs_input
- 2026-09-30T12:48:28Z · needs_input
- 2026-09-30T12:49:07Z · title, area, type, body
