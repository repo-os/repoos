---
id: "1263"
title: "QA pass: Settings general, agents and budget tabs"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-settings-general-agents-and-budg
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T02:27:07Z"
updated_at: "2026-11-20T03:36:07Z"
review_rounds: 1
review_passes: 1
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

## Shots
```json
[
{
"label": "Settings General with every setting control named",
"target": "default",
"route": "/settings?tab=general"
},
{
"label": "Agents Budget Controls tab with named controls",
"target": "default",
"route": "/agents?tab=budget-controls"
}
]
```

## Activity

- 2026-11-20T02:27:07Z · created · t@t
- 2026-11-20T02:27:12Z · status inbox→ready
- 2026-11-20T02:27:14Z · cli_override, model_override
- 2026-11-20T02:27:15Z · status ready→active, branch
- 2026-11-20T02:49:36Z · body
- 2026-11-20T02:58:45Z · body
- 2026-11-20T03:02:13Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:05:56Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T03:05:58Z · status active→review
- 2026-11-20T03:05:58Z · message_queued at 2026-11-20T03:05:58.392Z
- 2026-11-20T03:09:24Z · note: review pass 1: needs some work
- 2026-11-20T03:09:30Z · status review→active
- 2026-11-20T03:09:37Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T03:12:07Z · message_delivered: 1 message(s)
- 2026-11-20T03:22:32Z · body
- 2026-11-20T03:27:15Z · body
- 2026-11-20T03:32:01Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:36:05Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-20T03:36:07Z · status active→review
