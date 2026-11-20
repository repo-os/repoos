---
id: "1266"
title: "QA pass: Activity and Insights pages"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ""
created_by: t@t
branch: ""
created_at: "2026-11-20T03:07:06Z"
updated_at: "2026-11-20T03:07:06Z"
---
## Problem
Sweep the Activity and Insights pages for layout, wording and state bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T03:07:06Z · created · t@t
