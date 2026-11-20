---
id: "1262"
title: "QA pass: Checks page and check history views"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-checks-page-and-check-history-vi
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T02:26:53Z"
updated_at: "2026-11-20T02:27:01Z"
---
## Problem
Sweep the Checks page (local and remote tabs, history, failure details) for layout, wording and state bugs.

## Desired UX
Pages look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible empty, loading and error states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser.

## Activity

- 2026-11-20T02:26:53Z · created · t@t
- 2026-11-20T02:26:58Z · status inbox→ready
- 2026-11-20T02:26:59Z · cli_override, model_override
- 2026-11-20T02:27:01Z · status ready→active, branch
