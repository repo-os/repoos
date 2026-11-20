---
id: "1261"
title: "QA pass: Inbox and Review pages at phone, tablet and desktop widths"
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-20T01:42:34Z"
updated_at: "2026-11-20T01:42:36Z"
---
Problem: Final sweep of the Inbox and Review views. Walk each page headlessly (Playwright, never a visible browser) at 375, 768 and 1280 widths; check empty, loading and error states, keyboard focus and label wording. Fix every issue found (whole class), keep changes small, run scoped check once, hand off. Do not touch repoos.toml.

## Activity

- 2026-11-20T01:42:34Z · created · t@t
- 2026-11-20T01:42:36Z · needs_input
