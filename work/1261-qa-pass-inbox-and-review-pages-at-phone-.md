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
updated_at: "2026-11-20T01:42:41Z"
---
## Problem
Final sweep of the Inbox and Review views for layout, wording and state bugs at different screen sizes.

## Desired UX
Both pages look and behave correctly at 375, 768 and 1280 widths: no overflow, readable labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Each page walked headlessly (Playwright, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T01:42:34Z · created · t@t
- 2026-11-20T01:42:36Z · needs_input
- 2026-11-20T01:42:41Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
