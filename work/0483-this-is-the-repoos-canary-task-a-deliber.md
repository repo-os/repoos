---
id: "0483"
title: "This is the repoos canary task: a deliberately trivial ch…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
review_model_override: opencode-go/hy3
created_at: "2026-09-22T14:36:07Z"
updated_at: "2026-09-22T14:36:26Z"
---
This is the repoos canary task: a deliberately trivial change used to smoke-test the full flow (draft, inbox, ready, active, review, merge, done) end to end. The only change to make is in src/core/canary.ts: increment the exported CANARY_COUNTER constant by 1, wrapping from 9 back to 0. Do not touch anything else, do not add tests or comments beyond what's already there, and do not change CANARY_PROMPT itself.

## Original prompt

This is the repoos canary task: a deliberately trivial change used to smoke-test the full flow (draft, inbox, ready, active, review, merge, done) end to end. The only change to make is in src/core/canary.ts: increment the exported CANARY_COUNTER constant by 1, wrapping from 9 back to 0. Do not touch anything else, do not add tests or comments beyond what's already there, and do not change CANARY_PROMPT itself.

## Activity

- 2026-09-22T14:36:07Z · created · hello@repoos.org
- 2026-09-22T14:36:26Z · review_model_override
