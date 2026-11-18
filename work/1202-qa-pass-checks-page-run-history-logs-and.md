---
id: "1202"
title: "QA pass: Checks page run history, logs and failure detail – desktop and 375px"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-checks-page-run-history-logs-and
created_at: "2026-11-18T20:17:41Z"
updated_at: "2026-11-18T20:28:32Z"
---
## Problem
Check run detail and failure views are dense and may overflow or hide the failing step.
## Desired UX
A failed run clearly shows the failing step, logs scroll properly and nothing overflows at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-checks-detail.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Shots
```json
[
{
  "label": "Checks run history with expanded step details",
  "target": "default",
  "route": "/checks?tab=runs",
  "highlight": ".cr-detail-row",
  "steps": [
    {
      "click": "tr[data-outcome=\"pass\"]"
    }
  ],
  "state": "checks:timings"
}
]
```

## Activity

- 2026-11-18T20:17:41Z · created · t@t
- 2026-11-18T20:17:45Z · status inbox→ready
- 2026-11-18T20:17:47Z · status ready→active, branch
- 2026-11-18T20:28:32Z · body
