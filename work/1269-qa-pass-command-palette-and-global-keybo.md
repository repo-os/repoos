---
id: "1269"
title: "QA pass: command palette and global keyboard shortcuts"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ""
created_by: t@t
branch: ""
created_at: "2026-11-20T05:08:53Z"
updated_at: "2026-11-20T05:08:53Z"
---
## Problem
Sweep the command palette and keyboard shortcuts for focus, wording, mobile and screen-reader bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T05:08:53Z · created · t@t
