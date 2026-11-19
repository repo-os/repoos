---
id: "1236"
title: "Bound LoginView's auth status/health/me fetches (follow-up from #1226 QA pass)"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
paths: [src/ui-app/src/views/LoginView.vue]
priority: p3
area: web
depends_on: ["1226"]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T16:18:14Z"
updated_at: "2026-11-19T16:18:24Z"
---
## Problem
QA pass #1226 bounded the boot-gating fetches in the web app, but `LoginView.checkStatus` still issues its own unbounded `fetch("/api/auth/status")` and `/api/auth/me` with no `AbortSignal` — a stalled connection leaves the login page's spinner up until the browser's default timeout, the same unbounded-fetch class the pass fixed elsewhere.

## Desired UX
When the server is slow or unreachable, the login page shows a plain-English status (never an endless spinner), recovers on its own, and stays usable at 375, 768 and 1280 px.

## Acceptance criteria
- `checkStatus` fetches are bounded with the same pattern as the boot path (timeout + plain-English failure state).
- Headless Playwright only, against fixtures and request interception; never a visible browser or stolen focus.
- Fix verified with tests under slow/500/offline responses.

## Notes for AI
- The #1226 QA doc (`docs/qa/2026-11-offline-slow-network-qa.md`) explicitly declared login screens out of scope; review passes 1 and 2 both recommended this follow-up.
- Do not touch repoos.toml.

## Activity

- 2026-11-19T16:18:14Z · created · t@t
- 2026-11-19T16:18:15Z · needs_input
- 2026-11-19T16:18:24Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
