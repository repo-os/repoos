---
id: "1263"
title: "QA pass: Settings general, agents and budget tabs"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ""
created_by: t@t
branch: ""
created_at: "2026-11-20T02:27:07Z"
updated_at: "2026-11-20T02:27:07Z"
---
## Problem
Sweep the Settings general, agents and budget tabs for layout, wording, save and validation bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T02:27:07Z · created · t@t
