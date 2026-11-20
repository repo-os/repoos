---
id: "1261"
title: "QA pass: Inbox and Review pages at phone, tablet and desktop widths"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-inbox-and-review-pages-at-phone-
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T01:42:34Z"
updated_at: "2026-11-20T02:04:24Z"
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
- 2026-11-20T01:42:41Z · needs_input
- 2026-11-20T01:42:48Z · status inbox→ready
- 2026-11-20T01:42:52Z · cli_override, model_override
- 2026-11-20T01:43:00Z · status ready→active, branch
- 2026-11-20T01:55:23Z · body
- 2026-11-20T02:04:24Z · body
