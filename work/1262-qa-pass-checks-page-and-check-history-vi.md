---
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-20T03:19:36.092Z: repoos check failed: reused check inputs changed during handoff — run the check again"
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
updated_at: "2026-11-20T03:19:32Z"
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

## Shots
```json
[
{
"label": "Check plan at phone width: long step names and commands wrap or scroll inside their cards",
"target": "default",
"route": "/checks?tab=plan",
"highlight": ".ck-steps",
"state": "checks:longData"
},
{
"label": "Now tab: local slots and close-out pipeline share one divider and label style",
"target": "default",
"route": "/checks?tab=now",
"highlight": ".ips-local-slots",
"state": "checks:progress"
}
]
```

## Activity

- 2026-11-20T02:26:53Z · created · t@t
- 2026-11-20T02:26:58Z · status inbox→ready
- 2026-11-20T02:26:59Z · cli_override, model_override
- 2026-11-20T02:27:01Z · status ready→active, branch
- 2026-11-20T02:43:33Z · body
- 2026-11-20T02:45:32Z · body
- 2026-11-20T02:46:57Z · CTO nudge: held — handoff gate is running
- 2026-11-20T02:48:38Z · message_queued at 2026-11-20T02:48:38.576Z
- 2026-11-20T02:48:41Z · message_delivered: 1 message(s)
- 2026-11-20T02:58:38Z · body
- 2026-11-20T03:06:14Z · body
- 2026-11-20T03:12:15Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:19:32Z · message_queued at 2026-11-20T03:19:32.924Z

