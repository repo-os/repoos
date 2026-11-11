---
id: "1093"
title: "Release email: send-to-self test"
type: chore
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p3
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-11T05:28:23Z"
updated_at: "2026-11-11T05:28:24Z"
---
Follow-up from #1071. Add an end-to-end test that drives deliverCutReleaseEmail through the real sendEmail path with a fake Resend endpoint, asserting the From header and one message per recipient. Current tests use an injected fetchImpl and do not cover the sendEmail wiring.

## Activity

- 2026-11-11T05:28:23Z · created · njachowski@gmail.com
- 2026-11-11T05:28:24Z · needs_input
