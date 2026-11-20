---
id: "1273"
title: "QA pass: login, lock screen and session expiry flows"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-20T07:06:52Z"
updated_at: "2026-11-20T07:06:57Z"
---
## Problem
Sweep sign-in, lock screen and session-expiry flows (code entry, errors, expired session, offline) for layout, wording and state bugs.

## Desired UX
Flows look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible error and loading states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths using dev login fixtures.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser. Never print or store real credentials.

## Activity

- 2026-11-20T07:06:52Z · created · t@t
- 2026-11-20T07:06:57Z · status inbox→ready
